# Install with an AI assistant

Give the following prompt to an AI assistant that has filesystem and shell access on the destination machine:

> Install the selected OpenCode components from this repository safely. OpenChamber is the convenient desktop wrapper and UI over OpenCode; it reuses the same global OpenCode configuration and needs no separate configuration.
>
> Before changing anything, inspect the repository and the destination's existing global OpenCode area. Use `$XDG_CONFIG_HOME/opencode` when `XDG_CONFIG_HOME` is set, otherwise use `~/.config/opencode`. Identify whether the active global configuration is `opencode.json`, `opencode.jsonc`, or another supported existing filename. Never create a repository-local configuration. Read only enough configuration structure to update the required `plugin` and `mcp` fields. Treat every unrelated value as opaque. Never print, quote, upload, or include the full configuration in a prompt, log, report, or tool output.
>
> Prepare a dry-run manifest of every source and destination path. Diff every collision. Do not overwrite, delete, or replace any existing file or setting without explicit user approval. Back up only files the user approves changing. Keep backups outside this repository with permissions restricted to the current user. A backup may contain secrets, so never print, quote, upload, or expose its contents.
>
> Copy all directories under `components/skills/` to the global `skills/` directory, preserving support files. Copy all files under `components/plugins/` to the global `plugins/` directory. Report conflicts before copying.
>
> Inspect and back up the existing global OpenCode configuration under the rules above. Preserve all permissions and every unrelated setting. For each missing npm plugin spec in `PLUGINS.md`, run `opencode plugin <pinned-spec> --global`. After every command, verify that OpenCode added the exact pinned spec without changing existing plugin entries, tuple options, permissions, or unrelated settings. Stop and restore the approved backup if a command changes anything else.
>
> On Windows, install OpenChamber Desktop from <https://github.com/openchamber/openchamber/releases/latest>. The desktop installer bundles a matching OpenCode CLI, so do not install OpenCode Desktop separately. Do not create an OpenChamber configuration file.
>
> Under the global OpenCode area, clone <https://github.com/d1alect-tech/unlimited-tavily-mcp>, check out commit `f942303bd58f089c6258afdb19d18addf574ce38`, and run `bun install --frozen-lockfile` in that checkout. If a checkout already exists, inspect its remote, commit, and local changes before proposing any update; never discard local work.
>
> Ask the user to create and populate a user-owned Tavily keys file directly on the destination machine, outside chat and outside this repository. Do not request, display, read, copy, or validate its contents. Minimally merge the `tavily` local MCP into the existing global OpenCode configuration. Its command must invoke `bun` with the actual absolute path to `src/index.ts` in the pinned checkout. Set `environment.TAVILY_API_KEYS_FILE` to the actual absolute path of the user's key file without opening that file. Preserve all existing MCP entries, permissions, environment entries, and unrelated settings.
>
> Any displayed diff or report must show only the structural changes to `plugin` and `mcp`. Redact values under keys or paths containing `key`, `token`, `password`, `secret`, `auth`, `header`, or `environment`, regardless of case. Do not expose unchanged context lines from the configuration.
>
> Validate that exactly the 16 documented skill directories and three local plugin files from this repository reached their approved destinations. Confirm the four pinned npm specs remain present alongside prior entries. Verify the three OpenAgent runtime-injected integrations by checking their tools in an agent session; do not assume they must appear in `opencode mcp list`. Verify Tavily tools after its native MCP starts.
>
> Fully restart OpenCode and OpenChamber because configuration-time files are not hot-reloaded. Run a simple non-secret discovery check for skills, plugins, and MCP tools. Report every changed path, every preserved collision, the selected configuration filename, verification results, and any action left for the user. Do not include configuration values beyond approved plugin specs and non-sensitive MCP structure.

This runbook is intentionally not executable. The assistant must adapt paths to the destination and request approval at each collision.
