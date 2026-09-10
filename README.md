# Portable OpenCode setup reference

This repository is a documentation-first, secret-free snapshot of selected OpenCode skills and local plugins. It records what to install and how to merge it into an existing global OpenCode setup without replacing user settings.

## OpenChamber

[OpenChamber](https://openchamber.dev/) is the primary convenient interface and wrapper over OpenCode for desktop UI and agent management. It consumes the same OpenCode global configuration, so this repository does not define a separate OpenChamber configuration.

On Windows, install OpenChamber Desktop from the [official Releases page](https://github.com/openchamber/openchamber/releases/latest). Its installer bundles a matching OpenCode CLI; do not install OpenCode Desktop separately. Source and project information are in the [OpenChamber repository](https://github.com/openchamber/openchamber).

## Contents

- [`SKILLS.md`](SKILLS.md) inventories the 16 skill snapshots under `components/skills/`.
- [`PLUGINS.md`](PLUGINS.md) inventories three local plugin sources and four pinned npm plugin specs.
- [`MCP.md`](MCP.md) distinguishes runtime-injected tools from the separately configured Tavily server.
- [`INSTALL_WITH_AI.md`](INSTALL_WITH_AI.md) is a cautious prompt for an AI installer.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) records upstream sources, licenses, and local sanitization.

## Scope

The tree includes only the selected documentation and source snapshots. It excludes live configuration, credentials, key pools, session data, dependencies, caches, logs, generated evaluations, build output, and components outside this curated set. No provider, model, or agent settings are included.

This is not an executable installer. Review the snapshots and use the AI runbook to copy them into an existing installation.
