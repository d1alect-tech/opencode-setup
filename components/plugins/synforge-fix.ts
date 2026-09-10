import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import os from "node:os"
import path_ from "node:path"

// SynForge streaming chunks may return `created` as an ISO string while the AI
// SDK expects a Unix number. Mixed upstreams can therefore require a rewrite.
//
// SSE parser MUST buffer across TCP chunks. The previous per-chunk
// TextDecoder.decode(chunk) + split("\n") dropped/corrupted lines that
// straddled chunk boundaries (and split UTF-8 codepoints).
//
// Invalid JSON data lines are dropped rather than forwarded because truncated
// tool call arguments otherwise crash OpenCode with AI_JSONParseError.
// Each SynForge request appends one metadata-only JSONL diagnostic row.
//
// Logging helpers remain local so the plugin has no runtime file dependency.
// The Astra Responses shim handles streams that omit content-part lifecycle
// events and output indexes, which the AI SDK would otherwise drop.
// We synthesize the missing events around the message item (responses path
// only; chat/messages streams pass through untouched).

type LogRow = {
  ts: string
  model: string
  path: string
  stream: boolean
  status: number
  ms: number
  bugs: string[]
  createdType?: string
  reasoningFields?: string[]
  reasoningTokens?: number
  longestGapMs?: number
  nEvents?: number
}

function appendRow(row: LogRow): void {
  const dir =
    process.env.SYNFORGE_BUG_LOG_DIR ||
    (process.env.XDG_STATE_HOME && path_.join(process.env.XDG_STATE_HOME, "opencode", "synforge-bugs")) ||
    (process.platform === "win32" &&
      process.env.LOCALAPPDATA &&
      path_.join(process.env.LOCALAPPDATA, "opencode", "synforge-bugs")) ||
    path_.join(process.env.HOME || os.homedir(), ".local", "state", "opencode", "synforge-bugs")
  mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  appendFileSync(path_.join(dir, day + ".jsonl"), JSON.stringify(row) + "\n")
}

function pathKind(url: string): string {
  if (url.includes("/v1/responses")) return "responses"
  if (url.includes("/v1/messages")) return "messages"
  if (url.includes("/v1/chat/completions")) return "chat"
  return "other"
}

// Requests may reach SynForge directly or through the supported local proxy
// endpoints. Matching both keeps normalization active in either topology.
//
// Port 8788 is deliberately excluded because the responses shim below
// synthesizes SynForge-specific event lifecycles that do not apply there.
const SYNFORGE_ENDPOINTS: readonly string[] = [
  "api.synforge.cc",
  "127.0.0.1:8787", // Local SynForge OpenAI proxy (chat/completions + responses)
  "127.0.0.1:8789", // Local SynForge Anthropic proxy (/v1/messages)
  "localhost:8787",
  "localhost:8789",
]

// Master switch for the Astra Responses shim below.
//
// With this false, /v1/responses streams pass through untouched: no synthesized
// lifecycle events, status rewriting, event renumbering, or replacement event headers.
//
// The shim remains available for SynForge response streams that omit content-part
// lifecycle events or output indexes. Re-enable it only after confirming that shape.
const ASTRA_RESPONSES_SHIM = false

function isSynforgeUrl(url: string): boolean {
  for (const e of SYNFORGE_ENDPOINTS) {
    if (url.includes(e)) return true
  }
  return false
}

function pickModel(reqBody: string): string {
  try {
    const obj = JSON.parse(reqBody) as Record<string, unknown>
    return typeof obj.model === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:/+@-]{0,127}$/.test(obj.model) &&
      !/(?:^|[/.:@])(?:bearer|sk|pk|rk|forge)[_-]/i.test(obj.model) &&
      !/(?:AKIA|eyJ)[A-Za-z0-9_-]+/.test(obj.model) &&
      !/[A-Za-z0-9_-]{24,}/.test(obj.model)
      ? obj.model
      : "unknown"
  } catch {
    return "unknown"
  }
}

function inspectSsePayload(payload: string): {
  ok: boolean
  createdType: string
  earlyStop: boolean
  deltaKeys: string[]
} {
  try {
    const obj = JSON.parse(payload) as Record<string, any>
    let createdType = "absent"
    if ("created" in obj) createdType = typeof obj.created
    if ("created_at" in obj) createdType = typeof obj.created_at
    const deltaKeys: string[] = []
    const choice = obj.choices?.[0]
    if (choice?.delta && typeof choice.delta === "object") {
      for (const k of Object.keys(choice.delta)) {
        if (k.includes("reasoning")) deltaKeys.push(k)
      }
    }
    // Only "length" means the model hit a token budget; "stop" is a normal
    // completion and must not be classified as early termination.
    const earlyStop = choice?.finish_reason === "length"
    return { ok: true, createdType, earlyStop, deltaKeys }
  } catch {
    return { ok: false, createdType: "absent", earlyStop: false, deltaKeys: [] }
  }
}

function inspectJsonBody(obj: Record<string, any>): {
  reasoningTokens: number
  reasoningFields: string[]
  createdType: string
  bugs: string[]
  hasApiError: boolean
} {
  const usage = obj.usage ?? {}
  const details = usage.output_tokens_details ?? {}
  const reasoningTokens = typeof details.reasoning_tokens === "number" ? details.reasoning_tokens : 0
  const reasoningFields: string[] = []
  const bugs: string[] = []
  let createdType = "absent"
  if ("created" in obj) createdType = typeof obj.created
  if ("created_at" in obj) createdType = typeof obj.created_at
  const flat = JSON.stringify(obj)
  for (const f of ['"reasoning_content"', '"reasoning_details"', '"reasoning_text"', '"reasoning":{']) {
    if (flat.includes(f)) reasoningFields.push(f.slice(1, -1).replace(":{", ""))
  }
  if (reasoningTokens > 0 && reasoningFields.length === 0) bugs.push("billed_no_field")
  return { reasoningTokens, reasoningFields, createdType, bugs, hasApiError: Boolean(obj.error) }
}

function fixCreated(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj.created === "string") {
    const ts = Date.parse(obj.created)
    obj.created = Number.isNaN(ts) ? Math.floor(Date.now() / 1000) : Math.floor(ts / 1000)
  }
  return obj
}

// NOTE: nothing here may be exported except the default Plugin. opencode
// treats EVERY named runtime export as a plugin factory and calls it with
// PluginInput — exporting a helper made the whole plugin fail to load
// ("line.startsWith is not a function") and every prompt died with
// UnknownError. `export type` is erased at compile time, so it stays safe.
type StreamAcc = {
  bugs: Set<string>
  createdType: string
  reasoningFields: Set<string>
  reasoningTokens: number
  nEvents: number
  longestGapMs: number
  lastAt: number
  // Astra Responses shim state (responses path only). Sol-shaped streams pass
  // through untouched except event numbering, which preserves order.
  path: string
  seq: number
  needInProgress: boolean
  createdResp: any
  msgId: string | null
  outIdx: number
  accText: string
  partOpened: boolean
  doneClosed: boolean
  upstreamPart: boolean
}

function newAcc(): StreamAcc {
  return {
    bugs: new Set(),
    createdType: "absent",
    reasoningFields: new Set(),
    reasoningTokens: 0,
    nEvents: 0,
    longestGapMs: 0,
    lastAt: Date.now(),
    path: "other",
    seq: 0,
    needInProgress: false,
    createdResp: null,
    msgId: null,
    outIdx: 0,
    accText: "",
    partOpened: false,
    doneClosed: false,
    upstreamPart: false,
  }
}

function closingEvents(acc: StreamAcc): string[] {
  if (!acc.partOpened || acc.doneClosed) return []
  const id = acc.msgId ?? "msg_unknown"
  const idx = acc.outIdx
  const text = acc.accText
  acc.doneClosed = true
  acc.partOpened = false
  const num = (o: any) => emitEvent(o, acc)
  return [
    num({ type: "response.output_text.done", item_id: id, output_index: idx, content_index: 0, text, logprobs: [] }),
    num({
      type: "response.content_part.done",
      item_id: id,
      output_index: idx,
      content_index: 0,
      part: { type: "output_text", text, annotations: [] },
    }),
    num({
      type: "response.output_item.done",
      output_index: idx,
      item: {
        id,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
        phase: "final_answer",
      },
    }),
  ]
}

// One SSE event block: `event: <type>` + `data: <json>`. Blocks are joined with
// a blank line by the caller — dropping that blank line merges every event into
// one, which is exactly what made both astra and sol come back empty.
function emitEvent(o: any, acc: StreamAcc): string {
  o.sequence_number = acc.seq++
  return "event: " + String(o.type) + "\ndata: " + JSON.stringify(o)
}

function noteGap(acc: StreamAcc): void {
  const now = Date.now()
  const gap = now - acc.lastAt
  if (gap > acc.longestGapMs) acc.longestGapMs = gap
  acc.lastAt = now
}

function rewriteDataLine(line: string, acc: StreamAcc): string {
  if (!line.startsWith("data: ")) return line
  const payload = line.slice(6).trim()
  if (payload === "[DONE]" || payload === "") return line
  acc.nEvents += 1
  noteGap(acc)
  const sse = inspectSsePayload(payload)
  if (!sse.ok) {
    acc.bugs.add("bad_json")
    return ""
  }
  if (sse.createdType !== "absent") acc.createdType = sse.createdType
  if (sse.createdType === "string") acc.bugs.add("iso_created")
  if (sse.earlyStop) acc.bugs.add("early_stop")
  for (const k of sse.deltaKeys) {
    if (k === "reasoning_content" || k === "reasoning" || k === "reasoning_details") {
      acc.reasoningFields.add(k)
    }
  }
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>
    const inspected = inspectJsonBody(obj)
    acc.reasoningTokens = Math.max(acc.reasoningTokens, inspected.reasoningTokens)
    for (const f of inspected.reasoningFields) acc.reasoningFields.add(f)
    // Responses-event normalizer (responses path only). Astra arrives sparse:
    // no sequence_number, no in_progress, output_item.added with
    // status:completed, deltas without output_index — the SDK drops such
    // deltas and the reply is empty. Rebuilt to the sol shape.
    if (ASTRA_RESPONSES_SHIM && acc.path === "responses") {
      const t = (obj as any).type
      if (typeof t === "string" && t.startsWith("response.")) {
        if (t.includes("reasoning")) acc.reasoningFields.add("response.reasoning")
        const num = (o: any) => emitEvent(o, acc)
        if (t === "response.created") {
          const o = obj as any
          acc.createdResp = o.response && typeof o.response === "object" ? o.response : null
          acc.needInProgress = true
          fixCreated(obj)
          return num(o)
        }
        const pre: string[] = []
        if (acc.needInProgress && t !== "response.in_progress") {
          acc.needInProgress = false
          const base =
            acc.createdResp && typeof acc.createdResp === "object" ? { ...acc.createdResp } : {}
          base.status = "in_progress"
          pre.push(num({ type: "response.in_progress", response: base }))
        } else if (t === "response.in_progress") {
          acc.needInProgress = false
        }
        if (t === "response.output_item.added") {
          const item = (obj as any).item
          if (item?.type === "message") {
            acc.msgId = typeof item.id === "string" ? item.id : null
            acc.outIdx = typeof (obj as any).output_index === "number" ? (obj as any).output_index : 0
            acc.accText = ""
            acc.partOpened = false
            acc.doneClosed = false
            acc.upstreamPart = false
            // Deltas arrive after added: a completed status here makes the SDK
            // ignore them, so normalize to in_progress like sol.
            if (item.status !== "in_progress") item.status = "in_progress"
            fixCreated(obj)
            // part.added is synthesized lazily on the first delta, and only
            // when upstream didn't send its own (sol sends full lifecycle —
            // emitting ours on top duplicates events and breaks the SDK).
            return [...pre, num(obj)].join("\n\n")
          }
        } else if (t === "response.output_text.delta") {
          const o = obj as any
          if (typeof o.output_index !== "number") o.output_index = acc.outIdx
          if (typeof o.content_index !== "number") o.content_index = 0
          if (typeof o.item_id !== "string" && acc.msgId) o.item_id = acc.msgId
          if (!("logprobs" in o)) o.logprobs = []
          if (typeof o.delta === "string") acc.accText += o.delta
          fixCreated(obj)
          const extra: string[] = []
          if (!acc.partOpened && !acc.upstreamPart && acc.msgId) {
            acc.partOpened = true
            extra.push(
              num({
                type: "response.content_part.added",
                item_id: acc.msgId,
                output_index: acc.outIdx,
                content_index: 0,
                part: { type: "output_text", text: "", annotations: [] },
              }),
            )
          }
          return [...pre, ...extra, num(o)].join("\n\n")
        } else if (t === "response.completed") {
          const o = obj as any
          const resp = o.response && typeof o.response === "object" ? o.response : (o.response = {})
          if (resp.status !== "completed") resp.status = "completed"
          // Belt and braces: a reader that only looks at the final response
          // object still finds the text even if it ignores streamed parts.
          if (!Array.isArray(resp.output) || resp.output.length === 0) {
            resp.output = [
              {
                id: acc.msgId ?? "msg_unknown",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: acc.accText, annotations: [] }],
                phase: "final_answer",
              },
            ]
          }
          fixCreated(obj)
          return [...pre, num(o), ...closingEvents(acc)].join("\n\n")
        }
        // Upstream already runs the full lifecycle (sol): remember it so the
        // completed branch doesn't emit duplicate done events after upstream's.
        if (t === "response.content_part.added") acc.upstreamPart = true
        if (
          t === "response.output_text.done" ||
          t === "response.content_part.done" ||
          t === "response.output_item.done"
        ) {
          acc.doneClosed = true
          acc.partOpened = false
        }
        fixCreated(obj)
        return [...pre, num(obj)].join("\n\n")
      }
    }
    fixCreated(obj)
    return "data: " + JSON.stringify(obj)
  } catch {
    acc.bugs.add("bad_json")
    return ""
  }
}

function logSafe(row: LogRow): void {
  try {
    appendRow(row)
  } catch {
    // logging must never break the stream
  }
}

export default (async () => {
  const origFetch = globalThis.fetch.bind(globalThis)

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString()
    if (!isSynforgeUrl(url)) {
      return origFetch(input, init)
    }

    const path = pathKind(url)
    const reqBody = typeof init?.body === "string" ? init.body : ""
    const model = pickModel(reqBody)
    const t0 = Date.now()




    let res: Response
    try {
      res = await origFetch(input, init)
    } catch (err) {
      logSafe({
        ts: new Date().toISOString(),
        model,
        path,
        stream: false,
        status: 0,
        ms: Date.now() - t0,
        bugs: ["fetch_error"],
      })
      throw err
    }

    const ct = res.headers.get("content-type") ?? ""
    const status = res.status

    if (ct.includes("text/event-stream") || ct.includes("event-stream")) {
      if (!res.body) return res
      const decoder = new TextDecoder()
      let carry = ""
      const acc = newAcc()
      acc.path = path
      const transform = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          carry += decoder.decode(chunk, { stream: true })
          const lines = carry.split("\n")
          carry = lines.pop() ?? ""
          if (lines.length === 0) return
          const rewritten: string[] = []
          for (const l of lines) {
            // Blank line = SSE event separator: MUST survive.
            if (l.trim() === "") {
              rewritten.push("")
              continue
            }
            // We re-emit our own `event:` headers on the responses path (one
            // incoming line can expand into several events).
            if (ASTRA_RESPONSES_SHIM && acc.path === "responses" && l.startsWith("event:")) continue
            const r = rewriteDataLine(l, acc)
            if (r.length > 0) rewritten.push(r)
          }
          if (rewritten.length === 0) return
          controller.enqueue(new TextEncoder().encode(rewritten.join("\n") + "\n"))
        },
        flush(controller) {
          carry += decoder.decode()
          if (carry.length > 0) {
            const rewritten = rewriteDataLine(carry, acc)
            if (rewritten.length > 0) controller.enqueue(new TextEncoder().encode(rewritten))
          }
          // Stream cut before response.completed: still close the open part so
          // the SDK keeps whatever text arrived instead of dropping it.
          // Only meaningful while the shim is on — with it off nothing was synthesized,
          // so there is no half-open part of ours to close.
          const extra = ASTRA_RESPONSES_SHIM ? closingEvents(acc) : []
          if (extra.length > 0) controller.enqueue(new TextEncoder().encode("\n" + extra.join("\n\n") + "\n\n"))
          const bugs = [...acc.bugs]
          if (status >= 400) bugs.push("http_" + String(status))
          if (path !== "messages" && acc.reasoningTokens > 0 && acc.reasoningFields.size === 0) {
            bugs.push("billed_no_field")
          }
          logSafe({
            ts: new Date().toISOString(),
            model,
            path,
            stream: true,
            status,
            ms: Date.now() - t0,
            bugs,
            createdType: acc.createdType,
            reasoningFields: [...acc.reasoningFields],
            reasoningTokens: acc.reasoningTokens,
            longestGapMs: acc.longestGapMs,
            nEvents: acc.nEvents,
          })
        },
      })
      const headers = new Headers(res.headers)
      headers.delete("content-length")
      return new Response(res.body.pipeThrough(transform), {
        status: res.status,
        headers,
      })
    }

    if (ct.includes("application/json")) {
      const text = await res.text()
      const bugs: string[] = []
      if (status >= 400) bugs.push("http_" + String(status))
      try {
        const obj = JSON.parse(text) as Record<string, unknown>
        const inspected = inspectJsonBody(obj)
        if (inspected.createdType === "string") bugs.push("iso_created")
        if (path !== "messages") {
          for (const b of inspected.bugs) {
            if (b !== "iso_created") bugs.push(b)
          }
        }
        if (inspected.hasApiError) bugs.push("api_error")
        logSafe({
          ts: new Date().toISOString(),
          model,
          path,
          stream: false,
          status,
          ms: Date.now() - t0,
          bugs,
          createdType: inspected.createdType,
          reasoningFields: inspected.reasoningFields,
          reasoningTokens: inspected.reasoningTokens,
        })
        fixCreated(obj)
        return new Response(JSON.stringify(obj), {
          status: res.status,
          headers: { "content-type": "application/json" },
        })
      } catch {
        bugs.push("bad_json")
        logSafe({
          ts: new Date().toISOString(),
          model,
          path,
          stream: false,
          status,
          ms: Date.now() - t0,
          bugs,
        })
        return new Response(text, {
          status: res.status,
          headers: { "content-type": ct },
        })
      }
    }

    return res
  }

  return {}
}) satisfies Plugin
