import type { Hooks, Plugin, PluginModule } from "@opencode-ai/plugin";

/**
 * Set of tool IDs that must always run with `run_in_background: true`
 * so their subagent sessions stay live-watchable in the TUI/UI.
 *
 * NOTE: named exports here are safe ONLY because the default export uses the
 * V1 `PluginModule` shape (`{ id, server }`). When OpenCode's loader detects
 * that shape it ignores every named export. With a legacy default-function
 * export the loader iterates ALL exports and throws
 * `TypeError("Plugin export is not a function")` on non-function values.
 */
export const forceBackgroundTaskToolNames: ReadonlySet<string> = Object.freeze(
  new Set(["task", "call_omo_agent"]),
);

/**
 * Returns true when `rawArgs` is a plain object whose `run_in_background`
 * is explicitly `true`.
 */
export function isExplicitBackground(rawArgs: unknown): boolean {
  if (
    rawArgs === null ||
    rawArgs === undefined ||
    Array.isArray(rawArgs) ||
    typeof rawArgs !== "object"
  ) {
    return false;
  }
  return Reflect.get(rawArgs, "run_in_background") === true;
}

/**
 * Error message returned to the model when it attempts a synchronous
 * subagent call. Written as a corrective instruction so the model retries
 * the same call with `run_in_background=true`.
 */
export function rejectionMessage(toolName: string): string {
  return (
    `run_in_background=false (or omitted) is disabled in this environment: ` +
    `synchronous subagents are not live-watchable by the user. ` +
    `Retry the exact same ${toolName} call with run_in_background=true. ` +
    `You will receive a completion notification; collect results with ` +
    `background_output(task_id="bg_...") after it arrives. ` +
    `If no notification arrives within ~30s (fast tasks can finish before ` +
    `the host queues the notification — known host race), do NOT wait ` +
    `forever: call background_output(task_id="bg_...") with block=true ` +
    `and an explicit timeout to collect the result instead.`
  );
}

/**
 * Build the hook set. Exported separately so tests can exercise the hook
 * without constructing a full `PluginInput`.
 *
 * WHY REJECTION INSTEAD OF ARG REWRITING: in the installed opencode 1.18.12
 * (OpenChamber build) `tool.execute.before` hooks receive a CLONE of the
 * tool args — in-place mutation of `output.args` does NOT propagate to the
 * executing tool (verified empirically 2026-08-06: before-hook set
 * run_in_background=true and appended a prompt marker; the after-hook and
 * the subagent both saw the original unmutated args). Throwing is the only
 * supported enforcement: the error surfaces as the tool result and the
 * model retries with run_in_background=true.
 */
export function createHooks(): Hooks {
  return {
    "tool.execute.before": async (input, output): Promise<void> => {
      if (!forceBackgroundTaskToolNames.has(input.tool)) {
        return;
      }
      if (isExplicitBackground(output.args)) {
        return;
      }
      throw new Error(rejectionMessage(input.tool));
    },
  };
}

const server: Plugin = async (): Promise<Hooks> => createHooks();

const plugin: PluginModule = {
  id: "force-background-task",
  server,
};

export default plugin;
