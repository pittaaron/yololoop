# Harness² Route

This example runs yololoop backlog items through [Harness²](https://github.com/google-research/harness2), so the agent's harness (`AGENTS.md`, `.agents/skills/`, `.codex/hooks.json`) gets better as the loop works through the backlog.

yololoop still owns the loop: it picks the item, makes the branch, runs the gates, checks the item off, and commits. `harness2_route.py` is the route. For one item it:

1. Runs the agent with the repository's current harness, in a throwaway git worktree.
2. Has an improver propose harness edits from what that run did, and runs the agent again with each edit.
3. Composes a final harness from those runs and runs the agent with it.
4. Applies the change from the final run, if it passed your gates. With `--adopt`, it also writes the improved harness into the repository, so it lands in the same gated commit.
5. Stores the adopted harness and the lesson behind it in `.yololoop/harness2/library/`, which the improver reads on later items.

A run "passes" when the agent exits 0, changes something, and every gate in `yololoop.config.json` passes inside its worktree. Harness² picks among passing runs without seeing any grades. yololoop then runs the gates again on the real repository.

## Try It Without Credentials

The fixture uses a script as the agent and a scripted improver, so it makes no model calls. Its starting `AGENTS.md` leaves out a rule the gate needs, so the first run fails until Harness² adds the rule.

```bash
git clone https://github.com/pittaaron/yololoop.git
git clone https://github.com/google-research/harness2.git
git -C harness2 checkout 1cfe254e8d25b15f37048c3730134686abe60335
export PYTHONPATH="$PWD/harness2"
YOLOLOOP="$PWD/yololoop/bin/yololoop.js"

cp -r yololoop/examples/harness2-route /tmp/harness2-demo
cd /tmp/harness2-demo
git init -q && git add -A && git commit -qm fixture
node "$YOLOLOOP" loop --max 2 --no-branch
```

Expected result: the first item reports `chose agg1 (improved harness)` and adopts a new line in `AGENTS.md`. The second item's unmodified run passes, because the rule is already there. `.yololoop/harness2/library/` holds the lesson.

## Use It In Your Repository

Requirements: Python 3.12+, git, a Harness² checkout on `PYTHONPATH` (tested at commit `1cfe254`), and a local `claude` login for the improver. Copy `harness2_route.py` into your repository, or point the route at it by absolute path.

```json
{
  "version": 0,
  "routes": {
    "chore": {
      "mode": "command",
      "command": "python3",
      "args": [
        "harness2_route.py",
        "--improver", "claude",
        "--model", "claude-model-id",
        "--adopt",
        "--rollout-timeout", "1200",
        "--",
        "codex", "exec", "--json", "--sandbox", "workspace-write", "{{prompt}}"
      ],
      "timeoutSeconds": 14400
    }
  },
  "gates": [
    { "name": "tests", "command": "npm", "args": ["test"] }
  ]
}
```

Everything after `--` is the agent command. It runs inside each worktree, with `{{prompt}}`, `{{title}}` and `{{slug}}` filled in and the `YOLOLOOP_*` variables set. With `codex exec --json`, the improver gets Codex's full step-by-step trajectory; with any other agent it gets the agent's output and the gate results.

| Option | Default | Meaning |
|---|---|---|
| `--improver claude\|scripted` | `claude` | Who proposes harness edits. `scripted` is the no-model demo improver. |
| `--model <id>` | none | Anthropic model for the improver. Uses your own `claude` login, not Vertex AI. |
| `--k <n>` | `1` | Harness² recursion budget. |
| `--mode parallel\|sequential` | `parallel` | Harness² recursion mode. |
| `--adopt` | off | Write the chosen harness into the repository. |
| `--rollout-timeout <s>` | `900` | Limit for one agent run, and for each gate without its own `timeoutSeconds`. |

## Before You Turn It On

- **Cost.** At `--k 1` each item takes 4 agent runs and 3 improver sessions plus a reflection, instead of 1 agent run. Size the route's `timeoutSeconds` for that.
- **Worktrees start from your last commit plus tracked edits.** Untracked files are not copied into them. Gates that need installed dependencies (for example `node_modules`) must install them, since each worktree is a fresh checkout.
- **Harness files.** Only `AGENTS.md`, `.agents/skills/` and `.codex/hooks.json` are treated as harness. Existing `scripts/*.py` files are project code: `AGENTS.md` may name them, and the improver can add new helper scripts but never overwrites existing ones.
- **Claude Code as the agent.** Claude Code reads `CLAUDE.md`, not `AGENTS.md`. The prompt tells the agent to read `AGENTS.md`, so harness edits still reach it, but Codex picks them up natively.
- **If the agent edits harness files itself,** use `--adopt` so its diff applies on top of the improved harness.
- **Fallback.** Harness² only picks among its composed final runs. If none of them pass but the unmodified harness's run did, the route applies that run's change rather than throwing finished work away. It says `no improved run passed` when it does.
- **The improver runs with `--dangerously-skip-permissions`.** Harness² starts it in a temporary copy of the evidence, not in your repository.

## Files

- `harness2_route.py` - the route: a Harness² `BenchmarkAdapter` over one backlog item, plus the improver channels.
- `test_harness2_route.py` - end-to-end tests through the real yololoop CLI: `python3 -m unittest discover -s examples/harness2-route -v`.
- `scripts/fake-agent.mjs`, `scripts/check-notes.mjs` - the fixture's agent and gate.
