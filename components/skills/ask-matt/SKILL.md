---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the skills in this repo.
disable-model-invocation: true
---

# Ask Matt

Choose the smallest route that fits the request. Name only installed skills.

## Plan or clarify

- Use `grill-me` for a focused interview that sharpens a plan without writing project documents.
- Use `grill-with-docs` when the interview should also maintain project context, ADRs, or a glossary.
- Use `grilling` when another skill needs the interview method without either wrapper.
- Use `domain-modeling` when unclear or overloaded domain language is the main problem.

## Build and test

- Use `tdd` for a feature or bug fix that should follow red, green, then refactor.
- Use `frontend-design` to shape or polish a web interface.
- Use `webapp-testing` to drive a local web app in a browser and verify its behavior.

## GitHub

- Use `github` for repositories, pull requests, issues, releases, Actions, and other GitHub work.
- Use `gh` for precise GitHub CLI command patterns. Pair it with `github` when the task uses `gh`.

## Skills, knowledge, and writing

- Use `skill-creator` to create, revise, or evaluate a skill.
- Use `wiki-manager` for wiki ingestion, indexing, querying, audits, research, and session context capture.
- Use `unslop` to edit Russian prose and remove machine-written habits.
- Use `wait-what` when the last explanation did not land and needs a clearer re-pitch.
- Use `caveman` when the user asks for terse or token-light output.

## One-time setup

- Use `setup-matt-pocock-skills` once to configure the issue tracker, labels, and domain-document layout used by the Matt engineering skills.

If work crosses a session boundary, follow [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md). Otherwise, stay in the current session and invoke the selected skill directly.
