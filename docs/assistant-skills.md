# Assistant Skills

yololoop ships assistant-facing skills so agents can operate the loop consistently instead of improvising shell commands. The intended assistant-facing handle is `/yololoop`.

## Codex

The Codex skill lives at:

```text
.agents/skills/yololoop/SKILL.md
```

Codex treats a skill as a reusable workflow package with instructions, optional scripts, and optional references. Repo-scoped Codex skills are discovered from `.agents/skills` at the current directory or repository root.

The skill tells Codex to:

- read the project context files
- run `yololoop doctor`
- run `yololoop plan` before live execution
- run only one loop step at a time
- inspect `.yololoop/runs/*.json`
- respect generated-state and secret boundaries

## Claude Code

The Claude-facing mirror lives at:

```text
.claude/skills/yololoop/SKILL.md
```

It uses the same workflow and safety rules. If a Claude Code installation expects plugin packaging instead of workspace skill folders, use this file as the skill payload when packaging the plugin.

## Command Route Examples

Codex route:

```json
{
  "mode": "command",
  "command": "codex",
  "args": [
    "exec",
    "Use /yololoop. Work only on the selected YOLOLOOP_ITEM_TITLE. Keep changes scoped, run project gates, and exit nonzero if incomplete."
  ]
}
```

Claude route:

```json
{
  "mode": "command",
  "command": "claude",
  "args": [
    "-p",
    "Use /yololoop. Work only on the selected YOLOLOOP_ITEM_TITLE. Keep changes scoped, run project gates, and exit nonzero if incomplete."
  ]
}
```

These examples assume the local `codex` or `claude` CLI is already authenticated through its normal mechanism. Do not put credentials in `yololoop.config.json`.
