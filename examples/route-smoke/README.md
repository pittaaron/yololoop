# Route Smoke Fixture

This fixture proves yololoop can run a command route that behaves like an agent.

```bash
cd examples/route-smoke
git init
node ../../bin/yololoop.js plan --no-branch
node ../../bin/yololoop.js run --once --no-branch
cat ROUTE_OUTPUT.md
```

For real Codex or Claude routes, see `docs/assistant-skills.md`.
