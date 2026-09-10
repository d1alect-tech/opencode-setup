# Plugins

Install npm plugins with `opencode plugin <spec> --global`. Local TypeScript plugins are loaded from the global `plugins/` directory. Preserve existing entries and files when installing these selections.

## Local snapshots

| Snapshot | Role | Destination |
|---|---|---|
| `force-background-task.ts` | Rejects synchronous subagent calls so their sessions remain observable in the UI. | `plugins/force-background-task.ts` |
| `synforge-fix.ts` | Normalizes selected streaming responses, drops malformed SSE payloads, and records redacted diagnostics. | `plugins/synforge-fix.ts` |
| `stream-recovery.ts` | Continues mechanically detected interrupted responses while exempting user cancellation and authentication failures. | `plugins/stream-recovery.ts` |

The authoritative Stream Recovery snapshot is the tested source included in this repository.

## Pinned npm specs

| Plugin spec | Role | Upstream | License |
|---|---|---|---|
| `oh-my-openagent@5.0.0-beta.48` | Agent orchestration and bundled runtime tools. | [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | [SUL-1.0](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/LICENSE.md) |
| `@cortexkit/aft-opencode@0.49.0` | Indexed code navigation and analysis tools. | [cortexkit/aft](https://github.com/cortexkit/aft) | MIT |
| `@dietrichgebert/ponytail@4.9.0` | Minimalist implementation guidance. | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | MIT |
| `@ramtinj95/opencode-tokenscope@1.8.1` | Session token-usage analysis. | [ramtinj95/opencode-tokenscope](https://github.com/ramtinj95/opencode-tokenscope) | MIT |

Install each missing pinned spec with `opencode plugin <spec> --global`. Inspect and back up the existing global configuration first, then confirm that unrelated entries and options remain unchanged.
