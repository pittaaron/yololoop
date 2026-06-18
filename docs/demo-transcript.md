# Demo Transcript

This transcript was generated from `examples/route-smoke`. It uses a local fake-agent script, so it does not require provider credentials.

```bash
$ cat BACKLOG.md
# Backlog

## Ready

- [ ] chore: prove route environment variables
```

```bash
$ node ../../bin/yololoop.js plan --no-branch
ready: chore: prove route environment variables
branch: <disabled>
route: command
- run command route for chore
- run configured gates
- mark backlog item complete after successful route and gates
- write .yololoop run artifact
wrote .yololoop/plans/plan-<timestamp>.json
```

```bash
$ node ../../bin/yololoop.js run --once --no-branch
passed: chore: prove route environment variables
wrote .yololoop/runs/run-<timestamp>.json
```

```bash
$ cat BACKLOG.md
# Backlog

## Ready

- [x] chore: prove route environment variables
```

```bash
$ cat ROUTE_OUTPUT.md
# Route Output

Title: chore: prove route environment variables
Type: chore
Slug: prove-route-environment-variables
Branch: chore/prove-route-environment-variables
```

```bash
$ node ../../bin/yololoop.js status
unchecked items: 0
next item: <none>
latest plan: ready
latest run: passed
```

Artifacts written:

```text
.yololoop/plans/plan-<timestamp>.json
.yololoop/runs/<run-id>/blocks.jsonl
.yololoop/runs/run-<timestamp>.json
```
