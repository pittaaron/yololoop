# Minimal OSS Release Scope

The first public release should prove one thing:

> A developer can turn a local `BACKLOG.md` item into a scoped, gated change with a visible plan and durable run artifact.

## In Scope

- Local CLI.
- JSON config.
- Markdown backlog parsing.
- Dry-run plan artifacts.
- One live run at a time.
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
