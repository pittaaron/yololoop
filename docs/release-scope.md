# Minimal OSS Release Scope

The first public release should prove one thing:

> A developer can turn a local `BACKLOG.md` item into a scoped, gated change with a visible plan and durable run artifact.

## In Scope

- Local CLI.
- JSON config.
- Markdown backlog parsing.
- Dry-run plan artifacts.
- One live run at a time.
- Bounded loops with `yololoop loop --max <n>`.
- Branch-backed commits for passed items with `--commit`.
- Command routes that call existing tools.
- Gate commands.
- Local run artifacts.
- A demo fixture.

## Out Of Scope

- Hosted UI.
- Hosted runners.
- Billing.
- Multi-user auth.
- Managed secrets.
- Background schedules.
- Workflow graph editor.
- Full autonomous repo manager.

## Block Graph Direction

The current primitive composes command routes and gates. The next abstraction should be a block graph built from the same pieces:

```json
{
  "blocks": [
    { "id": "apply", "type": "route", "route": "codex" },
    { "id": "test", "type": "gate", "command": "pytest", "args": ["-q"] },
    { "id": "review", "type": "route", "route": "claude-review" },
    { "id": "fix", "type": "route", "route": "codex-fix", "when": "review.failed" },
    { "id": "pr", "type": "pr", "when": "gates.passed" }
  ]
}
```

Rules for the first graph implementation:

- Keep routes as command adapters; do not hardcode provider APIs.
- Make each block write an artifact.
- Pass only structured outputs between blocks.
- Start with a linear graph before fanout/fanin.
- Let `loop --max` execute one graph per backlog item.

## Commercial Boundary

The OSS repo should stay useful by itself. The paid product should sell the things that become expensive or organizationally valuable:

- Managed secure environments.
- GitHub App access.
- Scheduled loops.
- Team approvals.
- Audit logs.
- Spend controls.
- Shared policy and route templates.
- Hosted operator UI.
