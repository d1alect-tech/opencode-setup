---
name: github
description: "Operate this machine's GitHub account via GitHub CLI (gh). Use when the user mentions GitHub, gh, repository create/clone/fork, repo settings, visibility, topics, pull requests/PRs, issues, reviews, releases, gists, Actions/workflow runs, gh api, or managing github.com. Do NOT use for local git-only work (commit, rebase, squash, blame) — that is git-master. Do NOT use for GitHub MCP setup."
---

# GitHub

Use the existing GitHub CLI authentication. Do not ask the user to paste a PAT or install GitHub MCP.

Also load the `gh` skill (`skill` tool, name `gh`) for CLI output/pagination/`gh api` patterns. This file is the local playbook.

## Defaults

| | |
|---|---|
| Account | `OWNER` |
| Profile | https://github.com/OWNER |
| CLI | `gh` (GitHub CLI 2.98+, in PATH) |
| Git protocol | HTTPS |
| git user.name | `OWNER` |
| git user.email | `OWNER@users.noreply.github.com` |
| Token scopes | `repo`, `workflow`, `read:org`, `gist` |
| New repos | **private** unless the user explicitly says public |

Before the first GitHub write in a session, run `gh auth status` once. If it is not logged in as `OWNER`, stop and tell the user.

Never print the token. Never put a PAT in chat, `opencode.jsonc`, or a skill file.

## How to run

- Non-interactive only. Always pass required flags (`--title`, `--body`, `--public`/`--private`, …). `gh` errors instead of prompting when stdin is not a TTY.
- Prefer `gh` over raw `curl` to `api.github.com`.
- Prefer `--json field1,field2` + `--jq` for structured data. Run `--json` with no fields to see available fields.
- Target another repo with `-R OWNER/REPO`. Default is the cwd remote, or `OWNER` when creating.
- List caps at ~30. Pass `-L N`.
- If a typed command cannot do it: `gh api …` or `gh api graphql`. Check `gh <cmd> --help` first.
- Local git (commit, rebase, push of already-tracked remotes) stays with **git-master**. Use this skill for GitHub-host operations.

## Safety — never do without an explicit user request

Refuse, even if it would be convenient:

- `gh repo delete`, archive, transfer, or rename
- `gh release delete`, deleting workflow runs, caches, secrets, variables, environments
- SSH / GPG / signing-key add/delete
- Changing the GitHub **profile** (name, bio, email, 2FA, tokens)
- `gh auth logout`, `gh auth refresh` with extra scopes, or writing `GH_TOKEN`
- `--force` push to `main`/`master`, or deleting the default branch
- Making a private repo **public**
- Org admin (`admin:org`) anything

Ask once, then proceed:

- Creating a **public** repo
- Changing visibility, default branch, or pages
- Force-push to a non-default branch
- Closing vs deleting issues/PRs (closing is fine when asked)

## Recipes

Create from the current folder (already has commits):

```bash
gh repo create REPO --private --source=. --remote=origin --push --description "…"
```

Create empty remote, then clone:

```bash
gh repo create REPO --private --clone --description "…"
```

List this account's repos:

```bash
gh repo list OWNER -L 100 --json name,visibility,url,isPrivate,updatedAt
```

PR from current branch:

```bash
gh pr create --title "…" --body "…" --base main
```

Issue:

```bash
gh issue create --title "…" --body "…"
```

Release:

```bash
gh release create vX.Y.Z --title "…" --notes "…"
```

Repo metadata:

```bash
gh repo edit OWNER/REPO --description "…" --add-topic foo --homepage URL
```

Fork + clone:

```bash
gh repo fork OWNER/REPO --clone
```

View / clone:

```bash
gh repo view OWNER/REPO --json name,url,description,visibility
gh repo clone OWNER/REPO
```

Auth / identity check:

```bash
gh auth status
gh api user --jq .login
```

## Failures

| Symptom | What to do |
|---|---|
| `gh` not found | Install GitHub CLI and add `gh` to `PATH`. |
| HTTP 401 / not logged in | Stop. User must `gh auth login`. Do not invent a token. |
| HTTP 403 / missing scope | Report the missing scope. Do not `gh auth refresh` unless the user asks. |
| `must provide --title and --body` | Re-run with flags; never try to attach a TTY. |
| Ambiguous repo | Pass `-R OWNER/REPO`. |
| `git push` auth error | `gh auth setup-git`, then retry. |

After any create/edit, print the `https://github.com/…` URL.
