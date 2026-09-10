# MCP tools

## Runtime-injected tools

OpenAgent injects these bundled MCP integrations at runtime:

| Integration | Tools or purpose |
|---|---|
| `websearch` | Exa web search and retrieval. |
| `context7` | Current library and framework documentation. |
| `grep_app` | Public GitHub code examples. |

Plugin-injected MCPs are not native OpenCode configuration entries. They may therefore be available to agents without appearing in `opencode mcp list`.

## Tavily

The separately configured `tavily` MCP uses [d1alect-tech/unlimited-tavily-mcp](https://github.com/d1alect-tech/unlimited-tavily-mcp) at commit `f942303bd58f089c6258afdb19d18addf574ce38`. It is a local stdio proxy for Tavily tools and reads its key pool from a file outside this repository.

Clone the source under the global OpenCode area, check out the pinned commit, and install dependencies with `bun install --frozen-lockfile`. In the existing global OpenCode configuration, minimally add or merge one enabled local MCP entry whose command is `bun` followed by the absolute path to the checkout's `src/index.ts`. Do not put keys in the command or configuration.

Create the key file locally, outside chat and outside this repository, with one Tavily key per line. The installer should ask the user to populate it directly and should never read the values back.
