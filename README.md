# yololoop

Auditable local AI development loops that turn backlog items into gated, pull-request-ready changes.

yololoop is not another coding model. It is a small local control loop around the tools developers already use: git, GitHub CLI, Claude Code, Codex, OpenSpec, npm, shellcheck, and plain scripts. The first release is intentionally local-first and file-backed so every action has a visible plan, durable artifact, and quality gate.

## Status

This is an initial OSS core pass extracted from the local loop that runs the yololoop project itself. The public contract is intentionally small:

- `yololoop init`
- `yololoop doctor`
- `yololoop plan`
- `yololoop run --once`
- `yololoop loop --max <n>`
- `yololoop pr --dry-run`
- `yololoop status`

Hosted runners, billing, auth, managed environments, and the full yololoop.com UI are not part of this repo yet.

## Quick Start

Prerequisite: Node.js 22 or newer.

Install from GitHub until the first npm package is published:

```bash
npm install -g github:pittaaron/yololoop
mkdir my-agent-loop
cd my-agent-loop
git init
yololoop init
yololoop doctor
yololoop plan
```

After the first npm release, the install command will be:

```bash
npm install -g yololoop
```

`plan` is safe: it writes a JSON artifact under `.yololoop/plans/` and prints the side effects a live run would perform.

## Try It In Two Minutes

The route-smoke fixture uses a local script as the agent route, so it does not require Codex, Claude, or GitHub authentication.

```bash
git clone https://github.com/pittaaron/yololoop.git
cd yololoop/examples/route-smoke
git init
node ../../bin/yololoop.js plan --no-branch
node ../../bin/yololoop.js run --once --no-branch
node ../../bin/yololoop.js status
```

Expected result: the backlog item is checked off, `ROUTE_OUTPUT.md` records the selected `YOLOLOOP_*` environment values, and `.yololoop/runs/` contains a run artifact. See [the demo transcript](docs/demo-transcript.md) for the exact shape of the output.

Run one item:

```bash
yololoop run --once --commit
```

Run a bounded loop:

```bash
yololoop loop --max 10 --sleep 8 --max-runtime 14400 --timeout 900 --commit --branch yololoop/run
```

The loop stops when the backlog is empty, a route fails, a gate fails, `--max` is reached, or `--max-runtime` is reached. With `--commit`, each passed item is committed on its branch after the backlog item is checked off.

Every live run writes:

- `.yololoop/runs/run-*.json` for the full run artifact
- `.yololoop/runs/<run-id>/blocks.jsonl` for per-route and per-gate execution records

## Configure A Route

`yololoop.config.json` maps backlog item classes to routes. Command routes are the lowest-level primitive.

```json
{
  "version": 0,
  "runtime": {
    "defaultTimeoutSeconds": 900,
    "sleepSeconds": 0,
    "maxRuntimeSeconds": 0
  },
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

Model routes are a small convenience over command routes. They resolve model aliases and build the provider command for Codex or Claude Code.

```json
{
  "version": 0,
  "models": {
    "worker": "gpt-5.4-mini",
    "reviewer": "claude-opus-4-8"
  },
  "routes": {
    "chore": {
      "mode": "model",
      "runner": "codex",
      "model": "worker",
      "timeoutSeconds": 900,
      "args": ["--ephemeral", "-c", "approval_policy=\"never\""],
      "prompt": "Work only on {{title}}. Keep changes scoped and run the configured gates."
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

Replace the model IDs with models available to your local `codex` or `claude` CLI account.

When a route command runs, yololoop provides these environment variables:

- `YOLOLOOP_ITEM_TITLE`
- `YOLOLOOP_ITEM_TYPE`
- `YOLOLOOP_ITEM_SLUG`
- `YOLOLOOP_BRANCH`
- `YOLOLOOP_REPO`
- `YOLOLOOP_RUN_ID`
- `YOLOLOOP_MODEL`

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

## Assistant Skills

yololoop ships Codex and Claude skill files under `.agents/skills/yololoop/` and `.claude/skills/yololoop/`. The intended assistant-facing handle is `/yololoop`: use it to preview the next item, run one gated loop step, and inspect the resulting artifacts.

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
