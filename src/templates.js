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
`,
  "PROJECT.md": `# Project Context

Describe the product, architecture, quality bar, and important domain vocabulary here.

Keep this file durable. Agents should be able to read it and make better implementation decisions without searching through stale discussions.
`,
  "BACKLOG.md": `# Backlog

## Ready

- [ ] chore: replace this starter item with one small, testable task
`,
  "INBOX.md": `# Inbox

Raw ideas go here before they become executable BACKLOG.md items.
`,
  ".gitignore": `.yololoop/
.env
.env.*
node_modules/
`,
  "yololoop.config.json": `${JSON.stringify(defaultConfig, null, 2)}\n`
};
