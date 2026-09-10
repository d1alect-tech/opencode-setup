import type { Hooks, Plugin, PluginInput, PluginModule, PluginOptions } from "@opencode-ai/plugin";

/**
 * stream-recovery — auto-continue assistant responses interrupted mid-stream.
 *
 * PROBLEM: free-tier gateways (opencode-go / ox-alpha-free, echogate, …)
 * drop SSE streams mid-answer and return transient errors in bursts.
 * Native SessionRetry covers request-START failures, but two real-world
 * classes escape it (observed in production logs, 2026-08-21/22):
 *
 *   1. Truncated stream: gateway closes mid-answer without finish_reason →
 *      assistant message ends with finish="unknown" and NO error object.
 *   2. Retry limbo: native SessionRetry cycles 503/timeout errors forever
 *      (2s→…→30s backoff, no terminal state) — the turn hangs, the user
 *      waits, and the only manual exit (ESC) produces MessageAbortedError,
 *      which looks identical to a user-intentional cancel.
 *
 * RECOVERY SIGNALS (mechanical ONLY — no content-shape heuristics):
 *   - finish "length" | "error" | "unknown" (without error object)
 *   - error MessageOutputLengthError
 *   - error APIError with isRetryable != false
 *   - error UnknownError
 *   - error MessageAbortedError ONLY when WE aborted the session ourselves
 *     after detecting retry limbo (see below); genuine user ESC stays exempt
 *   NEVER: user-abort (unmarked), ProviderAuthError, healthy stop/tool-calls,
 *   internal summary messages (compaction/title/summary agents), models
 *   outside the allowlist.
 *
 * RETRY-LIMBO HANDLING: `session.status` events expose {type:"retry",
 * attempt,next}. If retries persist past limboMs (default 60s — enough for
 * one full native backoff ladder 2+4+8+16+30), the plugin aborts the stuck
 * turn itself (client.session.abort), marks the session as self-aborted, and
 * treats the resulting MessageAbortedError as recoverable.
 *
 * BUDGET: maxAttempts (default 4) per rolling window (default 5 min) per
 * session; ANY healthy finish (stop/tool-calls) resets the budget immediately
 * — intermittent failures spaced by successful turns never exhaust it. Our
 * own synthetic prompts carry MARKER and do NOT reset the budget.
 *
 * SUBAGENTS: the `event` hook receives the global bus, so subagent sessions
 * (task-tool driven) are covered by the exact same paths.
 *
 * Registered from opencode.jsonc as a tuple (NOTE: verified empirically that
 * tuple options do NOT reach local file plugins in 1.18.16/.18 — the live
 * behavior relies on DEFAULTS below; keep them sane).
 */

// ---------- structural mirrors of @opencode-ai/sdk shapes ----------

interface AssistantMessageLike {
  id: string;
  sessionID: string;
  role: string;
  summary?: boolean;
  modelID?: string;
  providerID?: string;
  finish?: string;
  error?: {
    name?: string;
    data?: { message?: string; statusCode?: number; isRetryable?: boolean };
  };
}

interface BusEventLike {
  type: string;
  properties?: unknown;
}

export interface StreamRecoveryOptions {
  /** modelIDs eligible for auto-recovery. Empty set = all models. */
  models?: string[];
  /** max continuation attempts per rolling window per session */
  maxAttempts?: number;
  /** delays (ms) before each successive continuation attempt */
  backoffMs?: number[];
  /** rolling window (ms) the attempt budget applies to */
  windowMs?: number;
  /** native-retry limbo duration before we take over (ms) */
  limboMs?: number;
  /** verbose logging */
  debug?: boolean;
}

// ---------- constants ----------

// All three Ox Alpha routes: opencode-go/Zen-Go (`ox-alpha-free`), OpenRouter
// (`stealth/ox-alpha`, added 2026-08-22) and OpenCode Zen public gateway
// (`x-preview-f-free`, active route since 2026-08-22 late). Same upstream
// stealth provider, same mid-stream failure modes — recovery must cover
// whichever route is selected.
// Tuple options in opencode.jsonc do NOT reach this local file plugin (1.18.16/.18).
// Empty allowlist = all models (incl. synforge/*). Previous ox-alpha-only list left
// every SynForge stream drop unrecoverable (finish=unknown, no error object).
const DEFAULT_MODELS: readonly string[] = [];
const DEFAULT_MAX_ATTEMPTS = 4;
// Attempt #1 fires immediately (no timer): a pending setTimeout is lost if
// the host process exits right after the failed turn (e.g. `opencode run`).
const DEFAULT_BACKOFF_MS: readonly number[] = [0, 3000, 8000];
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
// One full native backoff ladder (2+4+8+16+30 ≈ 60s) before taking over.
const DEFAULT_LIMBO_MS = 60 * 1000;
const PROCESSED_CAP = 500;
/** how long a self-abort mark stays valid for classifying the resulting error */
const SELF_ABORT_TTL_MS = 60 * 1000;
export const MARKER = "[stream-recovery]";

export const CONTINUE_PROMPT =
  `${MARKER} Your previous response was interrupted by a connection/stream ` +
  `failure before it finished. Continue exactly where you stopped. Do not ` +
  `repeat completed work and do not re-run tools that already executed. ` +
  `If the interrupted step was a tool call, re-issue only the remaining call.`;

// ---------- classification (pure; exported for tests) ----------

export type RecoveryDecision = { recoverable: boolean; reason: string };

export function classifyFailure(
  msg: AssistantMessageLike,
  models: ReadonlySet<string>,
  selfAborted = false,
): RecoveryDecision {
  if (msg.role !== "assistant") return { recoverable: false, reason: "not-assistant" };
  if (msg.summary) return { recoverable: false, reason: "internal-summary-message" };
  if (models.size > 0 && !(typeof msg.modelID === "string" && models.has(msg.modelID))) {
    return { recoverable: false, reason: "model-not-in-scope" };
  }

  const errName = msg.error?.name;

  // Hard exclusions — these must never be re-pinned…
  if (errName === "ProviderAuthError") return { recoverable: false, reason: "auth-error" };

  if (errName === "MessageAbortedError") {
    // …unless the abort was OUR OWN escape hatch from native-retry limbo.
    if (selfAborted) return { recoverable: true, reason: "self-abort-after-retry-limbo" };
    return { recoverable: false, reason: "user-abort" };
  }

  if (errName === "MessageOutputLengthError") return { recoverable: true, reason: "output-length-cap" };
  if (errName === "APIError") {
    if (msg.error?.data?.isRetryable === false) {
      return { recoverable: false, reason: "api-error-non-retryable" };
    }
    const code = msg.error?.data?.statusCode;
    return { recoverable: true, reason: code ? `api-error-${code}` : "api-error" };
  }
  if (errName === "UnknownError") return { recoverable: true, reason: "unknown-error" };

  // No error object recorded: fall back to the finish reason.
  if (!errName) {
    if (msg.finish === "length") return { recoverable: true, reason: "finish-length" };
    if (msg.finish === "error") return { recoverable: true, reason: "finish-error" };
    if (msg.finish === "unknown") return { recoverable: true, reason: "finish-unknown" };
  }

  return {
    recoverable: false,
    reason: errName ? `error-${errName}` : `finish-${msg.finish ?? "none"}`,
  };
}

function isHealthyFinish(msg: AssistantMessageLike): boolean {
  return (
    !msg.error &&
    (msg.finish === "stop" || msg.finish === "tool-calls")
  );
}

// ---------- hooks ----------

interface AttemptState {
  count: number;
  windowStart: number;
}

interface LimboState {
  firstAt: number;
  handled: boolean;
}

/** Minimal surface of the opencode client used here (structural). */
interface RecoveryClient {
  session: {
    promptAsync(input: {
      path: { id: string };
      body?: { parts?: Array<{ type: "text"; text: string }> };
    }): Promise<unknown>;
    abort(input: { path: { id: string } }): Promise<unknown>;
  };
}

export function createHooks(
  options: StreamRecoveryOptions = {},
  client?: RecoveryClient,
): Hooks {
  const models = new Set(options.models ?? DEFAULT_MODELS);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const limboMs = options.limboMs ?? DEFAULT_LIMBO_MS;
  const debug = options.debug === true;

  /** sessionID -> attempt budget state */
  const attempts = new Map<string, AttemptState>();
  /** failed messageIDs already acted upon (dedup across repeated events) */
  const processed = new Set<string>();
  /** sessionID -> native-retry limbo tracker */
  const limbo = new Map<string, LimboState>();
  /** sessionID -> expiry timestamp of our own abort (self-abort mark) */
  const selfAbort = new Map<string, number>();
  /** sessionID -> last seen modelID (to gate limbo takeover by allowlist) */
  const lastModel = new Map<string, string>();
  /** sessionID -> ts of direct limbo continuation (dedup vs message-path) */
  const directCont = new Map<string, number>();

  function log(...args: unknown[]): void {
    console.log("[stream-recovery]", ...args);
  }

  function rememberProcessed(id: string): boolean {
    if (processed.has(id)) return false;
    processed.add(id);
    if (processed.size > PROCESSED_CAP) {
      const oldest = processed.values().next().value;
      if (oldest !== undefined) processed.delete(oldest);
    }
    return true;
  }

  function consumeSelfAbort(sessionID: string): boolean {
    const expires = selfAbort.get(sessionID);
    if (expires === undefined) return false;
    selfAbort.delete(sessionID);
    return Date.now() <= expires;
  }

  function clearSelfAbort(sessionID: string): void {
    selfAbort.delete(sessionID);
  }

async function executeContinuation(sessionID: string): Promise<boolean> {
  try {
    await client?.session.promptAsync({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: CONTINUE_PROMPT }] },
    });
    log(`continuation sent to session ${sessionID}`);
    return true;
  } catch (e) {
    log(
      `failed to send continuation to session ${sessionID}: ` +
        (e instanceof Error ? e.message : String(e)),
    );
    return false;
  }
}

  const hooks: Hooks = {
    "chat.message": async (input, output) => {
      // Reset the attempt budget on every REAL user message. Our own
      // synthetic continuations carry MARKER and must NOT reset it.
      const isSynthetic = output.parts.some((p) => {
        const candidate = p as { type?: unknown; text?: unknown };
        return (
          candidate.type === "text" &&
          typeof candidate.text === "string" &&
          candidate.text.startsWith(MARKER)
        );
      });
      if (isSynthetic) {
        if (debug) log(`synthetic continuation observed in ${input.sessionID}; budget preserved`);
        return;
      }
      if (attempts.delete(input.sessionID) && debug) {
        log(`new user turn in ${input.sessionID}; attempt budget reset`);
      }
    },

    event: async ({ event }) => {
      const evt = event as BusEventLike;

      // ---- retry-limbo detection ----
      if (evt.type === "session.status") {
        const props = evt.properties as {
          sessionID?: string;
          status?: { type?: string; attempt?: number };
        } | undefined;
        const sid = props?.sessionID;
        const st = props?.status;
        if (!sid || !st) return;

        if (st.type === "retry") {
          // Gate by allowlist via last seen model for this session; sessions
          // whose model is unknown are left alone (conservative).
          const model = lastModel.get(sid);
          if (models.size > 0 && !(model && models.has(model))) return;

          const now = Date.now();
          const state = limbo.get(sid) ?? { firstAt: now, handled: false };
          limbo.set(sid, state);
          if (state.handled || now - state.firstAt < limboMs) return;

          // Take over: abort the natively-retrying turn, mark as ours.
          // NOTE: an abort issued during retry-wait may leave the assistant
          // message WITHOUT any terminal state (verified live 2026-08-22:
          // no error field, no finish). So we do NOT rely on the resulting
          // message events: budget is consumed HERE and the continuation is
          // dispatched immediately (a delayed timer would be lost when the
          // host process exits right after the aborted turn, e.g. CLI).
          const budget = attempts.get(sid) ?? { count: 0, windowStart: now };
          if (now - budget.windowStart > windowMs) {
            budget.count = 0;
            budget.windowStart = now;
          }
          if (budget.count >= maxAttempts) {
            state.handled = true;
            log(
              `session ${sid}: retry limbo persists but attempt budget is ` +
                `exhausted (${maxAttempts} in window) — leaving it to native retries`,
            );
            return;
          }
          budget.count += 1;
          attempts.set(sid, budget);
          state.handled = true;
          selfAbort.set(sid, now + SELF_ABORT_TTL_MS);
          log(
            `session ${sid}: native retries exceeded ${limboMs}ms; ` +
              `aborting stuck turn to hand over to recovery ` +
              `(attempt ${budget.count}/${maxAttempts})`,
          );
          void client
            ?.session.abort({ path: { id: sid } })
            .then(() => log(`stuck turn aborted in session ${sid}`))
            .catch((e: unknown) =>
              log(`failed to abort session ${sid}: ${e instanceof Error ? e.message : String(e)}`),
            );
          // Dispatch NOW: the aborted turn ends the host process in CLI mode,
          // so any delayed timer would never fire.
          directCont.set(sid, Date.now());
          void executeContinuation(sid).then(() => {
            // Re-arm: if the gateway is still down, the next retry-status
            // event starts a fresh limbo clock and consumes more budget.
            limbo.delete(sid);
          });
          return;
        }
        // "idle" definitively ends a limbo; "busy" must NOT reset it because
        // opencode may bounce busy↔retry between attempts.
        if (st.type === "idle") limbo.delete(sid);
        return;
      }

      // ---- assistant message lifecycle ----
      if (evt.type !== "message.updated") return;
      const props = evt.properties as { info?: AssistantMessageLike } | undefined;
      const info = props?.info;
      if (!info) return;

      if (info.role !== "assistant") return;
      if (typeof info.modelID === "string") {
        lastModel.set(info.sessionID, info.modelID);
        if (lastModel.size > PROCESSED_CAP) {
          const oldest = lastModel.keys().next().value;
          if (oldest !== undefined) lastModel.delete(oldest);
        }
      }

      // Healthy completion → gateway works again: fresh budget, limbo cleared,
      // any pending self-abort mark obsolete.
      if (isHealthyFinish(info)) {
        attempts.delete(info.sessionID);
        limbo.delete(info.sessionID);
        clearSelfAbort(info.sessionID);
        if (debug) log(`healthy finish in ${info.sessionID}; attempt budget reset`);
        return;
      }

      const decision = classifyFailure(info, models, consumeSelfAbort(info.sessionID));
      if (!decision.recoverable) return;
      // If the direct limbo path just sent a continuation for this session,
      // a late MessageAbortedError event must NOT trigger a second one.
      const dc = directCont.get(info.sessionID);
      if (dc !== undefined && Date.now() - dc < 15000) return;
      if (!rememberProcessed(info.id)) return;

      const now = Date.now();
      const state = attempts.get(info.sessionID) ?? { count: 0, windowStart: now };
      if (now - state.windowStart > windowMs) {
        state.count = 0;
        state.windowStart = now;
      }
      attempts.set(info.sessionID, state);

      if (state.count >= maxAttempts) {
        log(
          `session ${info.sessionID}: interrupted response (${decision.reason}) ` +
            `NOT recovered — attempt budget exhausted (${maxAttempts} in window). ` +
            `Manual retry may be needed.`,
        );
        return;
      }

      const attemptNo = state.count + 1;
      const delay = backoff[Math.min(attemptNo - 1, backoff.length - 1)] ?? 1000;
      state.count = attemptNo;

      // Attempt #1 with zero delay fires immediately — a pending setTimeout
      // would be lost if the host process exits right after the failed turn
      // (e.g. `opencode run` CLI). Retries keep their backoff.
      if (delay <= 0) {
        log(
          `session ${info.sessionID} message ${info.id}: interrupted response ` +
            `(${decision.reason}); auto-continue now (attempt ${attemptNo}/${maxAttempts})`,
        );
        void executeContinuation(info.sessionID);
      } else {
        log(
          `session ${info.sessionID} message ${info.id}: interrupted response ` +
            `(${decision.reason}); auto-continue in ${delay}ms ` +
            `(attempt ${attemptNo}/${maxAttempts})`,
        );
        setTimeout(() => {
          void executeContinuation(info.sessionID);
        }, delay);
      }
    },
  };

  return hooks;
}

// ---------- module (V1 shape, same as force-background-task.ts) ----------

const server: Plugin = async (input: PluginInput, options?: PluginOptions) =>
  createHooks(
    (options ?? {}) as StreamRecoveryOptions,
    input.client as unknown as RecoveryClient,
  );

const plugin: PluginModule = {
  id: "stream-recovery",
  server,
};

export default plugin;
