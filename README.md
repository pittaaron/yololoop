# yololoop

Auditable local AI development loops that turn backlog items into gated, pull-request-ready changes.

yololoop is not another coding model. It is a small local control loop around the tools developers already use: git, GitHub CLI, Claude Code, Codex, OpenSpec, npm, shellcheck, and plain scripts. The first release is intentionally local-first and file-backed so every action has a visible plan, durable artifact, and quality gate.

## Status

This is an initial OSS core pass. The CLI is functional, but the public contract is still small:

- `yololoop init`
- `yololoop doctor`
- `yololoop plan`
- `yololoop run --once`
- `yololoop status`

Hosted runners, billing, auth, managed environments, and the full yololoop.com UI are not part of this repo yet.

## Quick Start

```bash
npm install -g yololoop
mkdir my-agent-loop
cd my-agent-loop
git init
yololoop init
yololoop doctor
yololoop plan
```

`plan` is safe: it writes a JSON artifact under `.yololoop/plans/` and prints the side effects a live run would perform.

## Configure A Route

`yololoop.config.json` maps backlog item classes to command routes.

```json
{
  "version": 0,
  "routes": {
    "chore": {
      "mode": "command",
      "command": "codex",
      "args": [
        "exec",
        "Work on the selected yololoop backlog item. Keep changes scoped."
      ]
    }
  },
  "gates": [
    {
      "name": "tests",
      "command": "npm",
      "args": ["test", "--if-present"]
    }
  ]
}
```

When a route command runs, yololoop provides these environment variables:

- `YOLOLOOP_ITEM_TITLE`
- `YOLOLOOP_ITEM_TYPE`
- `YOLOLOOP_ITEM_SLUG`
- `YOLOLOOP_BRANCH`
- `YOLOLOOP_REPO`

## Backlog Format

yololoop reads the first unchecked Markdown task in `BACKLOG.md`.

```markdown
- [ ] chore: add a focused unit test for the parser
- [ ] bug: fix the status badge when no run exists
- [ ] proposal: design a route policy for high-risk tasks
```

The prefix controls the route:

- `chore:` -> `routes.chore`
- `bug:` or `fix:` -> `routes.bug`
- `proposal:` or `feature:` -> `routes.proposal`

## Demo

The `examples/demo-repo` fixture uses a tiny local script as its "agent" route.

```bash
cd examples/demo-repo
git init
node ../../bin/yololoop.js doctor
node ../../bin/yololoop.js plan --no-branch
node ../../bin/yololoop.js run --once --no-branch
git diff
```

The demo writes `NOTES.md`, records a run artifact, and checks off the backlog item.

## Design Principles

- Dry-run first.
- Local auth only; do not store provider credentials in repo files.
- File-backed state before databases.
- Agent work goes through explicit routes.
- Every run leaves an artifact.
- Gates decide whether a backlog item can be marked complete.
- Hosted execution is a separate paid product surface, not hidden in the OSS core.

## Development

```bash
npm test
npm run check
```

The package currently has no runtime dependencies.
