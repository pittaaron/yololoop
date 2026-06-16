---
name: yololoop-loop
description: Use when operating a yololoop repository from Claude Code: preview loop plans, run one gated backlog item, inspect run artifacts, or configure Claude/Codex command routes.
---

# yololoop Loop Operator

Use this skill when the user asks Claude Code to operate or configure yololoop in the current repository.

## Workflow

1. Read `AGENTS.md`, `PROJECT.md`, `BACKLOG.md`, and `yololoop.config.json`.
2. Run `yololoop doctor` before live work when available.
3. Run `yololoop plan` before `yololoop run --once`.
4. Summarize the chosen backlog item, route, branch, gates, and expected side effects.
5. Run `yololoop run --once` only when the user asked for a live run or approved the plan.
6. Inspect the latest `.yololoop/runs/*.json` artifact and report pass/fail evidence.
7. If a route or gate fails, fix the smallest cause and rerun the relevant gate.

## Safety Rules

- Never commit API keys, auth files, local session files, or model logs.
- Keep `.yololoop/` generated and gitignored.
- Do not edit unrelated backlog items.
- Do not mark work complete when gates failed.
- Keep each live run scoped to one backlog item.

## Route Worker Behavior

When invoked by a yololoop route, use the `YOLOLOOP_*` environment variables to identify the selected task. Implement only that task, run the requested project gates, and exit nonzero when work is incomplete or unsafe.
