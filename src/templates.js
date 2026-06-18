import { defaultConfig } from "./config.js";

export const templates = {
  "AGENTS.md": `# Agent Instructions

This repository uses yololoop for auditable local AI development loops.

Before editing code:

- Read PROJECT.md for product context.
- Read BACKLOG.md and work only on the selected unchecked item.
- Keep changes scoped.
- Run the configured gates before marking work done.
- Do not commit secrets, local run state, or model logs.
- Treat .yololoop/ as generated runtime state.
`,
  "PROJECT.md": `# Project Context

Describe the product, architecture, quality bar, and important domain vocabulary here.

Keep this file durable. Agents should be able to read it and make better implementation decisions without searching through stale discussions.
`,
  "BACKLOG.md": `# Backlog

## Ready

- [ ] chore: replace this starter item with one small, testable task
`,
  ".agents/skills/yololoop/SKILL.md": `---
name: yololoop
description: Use when operating a yololoop repository: initialize loop files, preview the next backlog item, run one gated loop step, inspect artifacts, or configure command routes for Codex, Claude, OpenSpec, git, npm, or local scripts.
---

# yololoop Loop Operator

Use this skill when the user asks to operate or configure yololoop in the current repository.

## Workflow

1. Inspect \`AGENTS.md\`, \`PROJECT.md\`, \`BACKLOG.md\`, and \`yololoop.config.json\`.
2. Run \`yololoop doctor\` before live work when the command is available.
3. Run \`yololoop plan\` before \`yololoop run --once\`.
4. Explain the selected backlog item, route, branch, gates, and side effects.
5. Run \`yololoop run --once\` only when the user asked for a live run or clearly approved the plan.
6. Inspect the latest \`.yololoop/runs/*.json\` artifact after a run.
7. If a route or gate fails, report the failing command, stderr summary, and next concrete fix.

## Safety Rules

- Never place API keys, tokens, session files, or model logs in committed files.
- Treat \`.yololoop/\` as generated local runtime state.
- Do not bypass configured gates to mark a backlog item complete.
- Keep live runs to one selected backlog item at a time.
- Prefer \`yololoop plan\` for investigation and demos.

## Route Authoring

Use command routes for existing tools. yololoop sets:

- \`YOLOLOOP_ITEM_TITLE\`
- \`YOLOLOOP_ITEM_TYPE\`
- \`YOLOLOOP_ITEM_SLUG\`
- \`YOLOLOOP_BRANCH\`
- \`YOLOLOOP_REPO\`

Keep route prompts scoped to the selected item and require the agent to run project gates before exiting.
`,
  ".claude/skills/yololoop/SKILL.md": `---
name: yololoop
description: Use when operating a yololoop repository from Claude Code: preview loop plans, run one gated backlog item, inspect run artifacts, or configure Claude/Codex command routes.
---

# yololoop Loop Operator

Use this skill when the user asks Claude Code to operate or configure yololoop in the current repository.

## Workflow

1. Read \`AGENTS.md\`, \`PROJECT.md\`, \`BACKLOG.md\`, and \`yololoop.config.json\`.
2. Run \`yololoop doctor\` before live work when available.
3. Run \`yololoop plan\` before \`yololoop run --once\`.
4. Summarize the chosen backlog item, route, branch, gates, and expected side effects.
5. Run \`yololoop run --once\` only when the user asked for a live run or approved the plan.
6. Inspect the latest \`.yololoop/runs/*.json\` artifact and report pass/fail evidence.
7. If a route or gate fails, fix the smallest cause and rerun the relevant gate.

## Safety Rules

- Never commit API keys, auth files, local session files, or model logs.
- Keep \`.yololoop/\` generated and gitignored.
- Do not edit unrelated backlog items.
- Do not mark work complete when gates failed.
- Keep each live run scoped to one backlog item.

## Route Worker Behavior

When invoked by a yololoop route, use the \`YOLOLOOP_*\` environment variables to identify the selected task. Implement only that task, run the requested project gates, and exit nonzero when work is incomplete or unsafe.
`,
  ".gitignore": `.yololoop/
.env
.env.*
node_modules/
`,
  "yololoop.config.json": `${JSON.stringify(defaultConfig, null, 2)}\n`
};
