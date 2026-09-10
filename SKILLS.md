# Skill snapshots

Install each snapshot by copying its directory to the global OpenCode skills directory under `$XDG_CONFIG_HOME/opencode/skills/` or `~/.config/opencode/skills/`. Keep every support file with its `SKILL.md`.

| Skill | Purpose and trigger | Local target | Source and license |
|---|---|---|---|
| `ask-matt` | Routes questions about which engineering workflow fits; use when the next skill or process is unclear. | `skills/ask-matt/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `domain-modeling` | Maintains domain terms, context maps, and architectural decisions; use for domain language or ADR work. | `skills/domain-modeling/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `frontend-design` | Guides distinctive interface design; use for new or substantially restyled web UI. | `skills/frontend-design/` | [anthropics/skills](https://github.com/anthropics/skills), included per-folder license |
| `gh` | Supplies reliable GitHub CLI invocation patterns; use when constructing `gh` commands. | `skills/gh/` | [cli/cli](https://github.com/cli/cli), MIT |
| `github` | Defines safe GitHub account and repository operations; use for GitHub-hosted writes and administration. | `skills/github/` | [cli/cli](https://github.com/cli/cli), MIT; locally adapted playbook |
| `grill-me` | Runs a focused design interview; use to sharpen an uncertain plan or decision. | `skills/grill-me/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `grill-with-docs` | Runs the same rigorous interview while recording decisions and terminology; use when durable docs are required. | `skills/grill-with-docs/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `grilling` | Stress-tests a proposal through persistent questioning; use on explicit requests to challenge an idea. | `skills/grilling/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `setup-matt-pocock-skills` | Prepares issue-tracker and domain-document conventions; run once before the related engineering workflows. | `skills/setup-matt-pocock-skills/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `skill-creator` | Creates, tests, and improves agent skills; use for skill authoring or evaluation. | `skills/skill-creator/` | [anthropics/skills](https://github.com/anthropics/skills), included per-folder license |
| `tdd` | Drives red-green-refactor development; use when test-first implementation is requested. | `skills/tdd/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `unslop` | Edits Russian prose to remove formulaic AI phrasing; use for Russian writing and revision. | `skills/unslop/` | Local, user-maintained snapshot |
| `wait-what` | Reframes an explanation that did not land; use when the user asks for a clearer re-pitch. | `skills/wait-what/` | [mattpocock/skills](https://github.com/mattpocock/skills), MIT |
| `webapp-testing` | Tests local web applications through browser automation; use for UI behavior, screenshots, and console checks. | `skills/webapp-testing/` | [anthropics/skills](https://github.com/anthropics/skills), included per-folder license |
| `wiki-manager` | Manages topic-scoped knowledge bases, provenance, querying, and session capture; use for wiki and knowledge-base workflows. | `skills/wiki-manager/` | [nvk/llm-wiki](https://github.com/nvk/llm-wiki), commit `7c94c9bf2968f17deb496b285db0afdb610a01d9`, MIT |
| `caveman` | Enforces compressed but accurate communication; use when the user requests brief or caveman-style output. | `skills/caveman/` | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), MIT |

No other upstream commit pins are asserted. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for modification notes.
