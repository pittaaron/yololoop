# Demo Script

Use this script to record the first public demo.

## Setup

Open a clean terminal from the repository root.

```bash
cd examples/route-smoke
rm -rf .git .yololoop ROUTE_OUTPUT.md
git init
```

## Show The Backlog

```bash
cat BACKLOG.md
```

Expected point: one unchecked item is waiting.

## Preview The Loop

```bash
node ../../bin/yololoop.js plan --no-branch
```

Expected point: yololoop shows the selected item, route, gate, side effects, and plan artifact path.

## Run One Step

```bash
node ../../bin/yololoop.js run --once --no-branch
```

Expected point: the route passes, the gate passes, and a run artifact is written.

## Inspect Evidence

```bash
cat ROUTE_OUTPUT.md
cat BACKLOG.md
node ../../bin/yololoop.js status
```

Expected point: the fake agent received the selected backlog item through `YOLOLOOP_*` variables, the backlog item is checked off, and the latest run status is `passed`.

## Show PR-Ready Path

For the public demo, explain that real PR creation uses branch mode and GitHub CLI:

```bash
node ../../bin/yololoop.js pr --dry-run
```

For a real repo with a passed branch-backed run:

```bash
node ../../bin/yololoop.js pr --draft
```
