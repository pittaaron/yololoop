---
name: yololoop
description: Use when operating a yololoop repository: initialize loop files, preview the next backlog item, run one gated loop step, inspect artifacts, or configure command routes for Codex, Claude, OpenSpec, git, npm, or local scripts.
---

# yololoop

Use this skill when the user asks to operate or configure yololoop in the current repository.

## Workflow

1. Inspect `AGENTS.md`, `PROJECT.md`, `BACKLOG.md`, and `yololoop.config.json`.
2. Run `yololoop doctor` before live work when the command is available.
3. Run `yololoop plan` before `yololoop run --once`.
4. Explain the selected backlog item, route, branch, gates, and side effects.
5. Run `yololoop run --once` only when the user asked for a live run or clearly approved the plan.
6. Inspect the latest `.yololoop/runs/*.json` artifact after a run.
7. If a route or gate fails, report the failing command, stderr summary, and next concrete fix.

## Safety Rules

- Never place API keys, tokens, session files, or model logs in committed files.
- Treat `.yololoop/` as generated local runtime state.
- Do not bypass configured gates to mark a backlog item complete.
- Keep live runs to one selected backlog item at a time.
- Prefer `yololoop plan` for investigation and demos.

## Route Authoring

Use command routes for existing tools. yololoop sets:

- `YOLOLOOP_ITEM_TITLE`
- `YOLOLOOP_ITEM_TYPE`
- `YOLOLOOP_ITEM_SLUG`
- `YOLOLOOP_BRANCH`
- `YOLOLOOP_REPO`
- `YOLOLOOP_RUN_ID`
- `YOLOLOOP_MODEL`

Keep route prompts scoped to the selected item and require the agent to run project gates before exiting.
