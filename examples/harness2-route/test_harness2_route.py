"""End-to-end tests for the Harness² route, driven through the real yololoop CLI.

Needs Node 22+, git, and Harness² importable (for example PYTHONPATH=<harness2 checkout>):

    python3 -m unittest discover -s examples/harness2-route -v
"""

from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent
YOLOLOOP = FIXTURE.parents[1] / "bin" / "yololoop.js"
RULE = "- End every file with a newline."


class Harness2RouteTest(unittest.TestCase):
    def setUp(self):
        # Shaped like the route's own throwaway worktrees, so every test also checks that
        # stale-worktree cleanup never mistakes the main repository for one of them.
        self.repo = Path(tempfile.mkdtemp(prefix="yololoop-h2-worktree-")) / "work"
        shutil.copytree(
            FIXTURE,
            self.repo,
            ignore=shutil.ignore_patterns("test_*.py", "__pycache__", ".yololoop"),
        )
        self.addCleanup(shutil.rmtree, self.repo.parent, ignore_errors=True)

    def commit_fixture(self):
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "fixture")

    def set_route_args(self, transform):
        path = self.repo / "yololoop.config.json"
        config = json.loads(path.read_text())
        route = config["routes"]["chore"]
        route["args"] = transform(route["args"])
        path.write_text(json.dumps(config, indent=2) + "\n")

    def yololoop(self, *args, env=None) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["node", str(YOLOLOOP), *args],
            cwd=self.repo,
            capture_output=True,
            text=True,
            env={**os.environ, **(env or {})},
        )

    def summary(self, slug: str) -> dict:
        [path] = glob.glob(str(self.repo / f".yololoop/harness2/runs/*/{slug}/summary.json"))
        return json.loads(Path(path).read_text())

    def rollout(self, slug: str, label: str) -> dict:
        [path] = glob.glob(str(self.repo / f".yololoop/harness2/rollouts/*/{slug}/{label}/result.json"))
        return json.loads(Path(path).read_text())

    def library_entries(self) -> list[str]:
        root = self.repo / ".yololoop/harness2/library/agg/work/harnesses"
        return sorted(p.name for p in root.iterdir()) if root.is_dir() else []

    def test_run_improves_the_harness_adopts_it_and_lands_the_change(self):
        self.commit_fixture()

        run = self.yololoop("run", "--once", "--no-branch")

        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("chose agg1 (improved harness)", run.stdout)
        self.assertFalse(self.rollout("write-a-release-note", "base1")["delivered"])
        self.assertTrue(self.rollout("write-a-release-note", "agg1")["delivered"])
        self.assertIn(RULE, (self.repo / "AGENTS.md").read_text())
        self.assertEqual(
            (self.repo / "notes/write-a-release-note.md").read_text(),
            "# chore: write a release note\n",
        )
        self.assertIn("- [x] chore: write a release note", (self.repo / "BACKLOG.md").read_text())
        self.assertEqual(self.library_entries(), ["write-a-release-note"])
        self.assertEqual(git(self.repo, "worktree", "list").stdout.count("\n"), 1)

    def test_adopted_harness_lets_the_next_item_pass_unmodified(self):
        self.commit_fixture()

        loop = self.yololoop("loop", "--max", "2", "--no-branch")

        self.assertEqual(loop.returncode, 0, loop.stdout + loop.stderr)
        self.assertIn("passed: completed 2/2", loop.stdout)
        self.assertTrue(self.rollout("write-an-upgrade-note", "base1")["delivered"])
        self.assertTrue(self.summary("write-an-upgrade-note")["selections"]["agg"]["chosen_tree_is_base"])

    def test_library_lesson_reaches_the_next_item_without_adopting(self):
        self.set_route_args(lambda args: [arg for arg in args if arg != "--adopt"])
        self.commit_fixture()

        loop = self.yololoop("loop", "--max", "2", "--no-branch")

        self.assertEqual(loop.returncode, 0, loop.stdout + loop.stderr)
        self.assertNotIn(RULE, (self.repo / "AGENTS.md").read_text())
        self.assertFalse(self.rollout("write-an-upgrade-note", "base1")["delivered"])
        [context] = glob.glob(
            str(self.repo / ".yololoop/harness2/runs/*/write-an-upgrade-note/context/inv1")
        )
        self.assertTrue((Path(context) / "library/INDEX.md").is_file())
        self.assertFalse(self.summary("write-an-upgrade-note")["selections"]["agg"]["chosen_tree_is_base"])

    def test_nothing_lands_when_no_run_passes(self):
        self.set_route_args(
            lambda args: args[: args.index("--") + 1] + ["node", "-e", "process.exit(0)"]
        )
        self.commit_fixture()

        run = self.yololoop("run", "--once", "--no-branch")

        self.assertEqual(run.returncode, 1, run.stdout + run.stderr)
        self.assertIn("no run passed the repository checks", run.stdout)
        self.assertFalse((self.repo / "notes").exists())
        self.assertIn("- [ ] chore: write a release note", (self.repo / "BACKLOG.md").read_text())
        self.assertEqual(git(self.repo, "status", "--porcelain").stdout, "")

    def test_falls_back_to_a_passing_unmodified_run(self):
        # Only the first agent run (the unmodified harness's) writes the final newline.
        flaky_agent = (
            "const fs = require('fs');"
            "const first = !fs.existsSync(process.env.FIRST_RUN_MARKER);"
            "fs.writeFileSync(process.env.FIRST_RUN_MARKER, '');"
            "fs.mkdirSync('notes', { recursive: true });"
            "fs.writeFileSync(`notes/${process.env.YOLOLOOP_ITEM_SLUG}.md`, first ? 'ok\\n' : 'ok');"
        )
        self.set_route_args(lambda args: args[: args.index("--") + 1] + ["node", "-e", flaky_agent])
        self.commit_fixture()
        marker = self.repo.parent / "first-run"

        run = self.yololoop("run", "--once", "--no-branch", env={"FIRST_RUN_MARKER": str(marker)})

        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("chose base1 (no improved run passed", run.stdout)
        self.assertFalse(self.rollout("write-a-release-note", "agg1")["delivered"])
        self.assertEqual((self.repo / "notes/write-a-release-note.md").read_text(), "ok\n")
        self.assertNotIn(RULE, (self.repo / "AGENTS.md").read_text())

    def test_removes_worktrees_left_by_a_killed_run(self):
        self.commit_fixture()
        stale = Path(tempfile.mkdtemp(prefix="yololoop-h2-worktree-")) / "work"
        git(self.repo, "worktree", "add", "--quiet", "--detach", str(stale), "HEAD")

        run = self.yololoop("run", "--once", "--no-branch")

        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertNotIn(str(stale), git(self.repo, "worktree", "list").stdout)
        self.assertFalse(stale.parent.exists())

    def test_project_scripts_named_in_agents_md_stay_out_of_the_harness(self):
        (self.repo / "scripts/lint.py").write_text("print('lint ok')\n")
        agents = self.repo / "AGENTS.md"
        agents.write_text(agents.read_text() + "Run `python3 scripts/lint.py` before finishing.\n")
        self.commit_fixture()

        run = self.yololoop("run", "--once", "--no-branch")

        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        stages = self.summary("write-a-release-note")["modes"]["agg"]["stages"]
        self.assertEqual([s["label"] for s in stages if s["fell_back"]], [])
        self.assertEqual((self.repo / "scripts/lint.py").read_text(), "print('lint ok')\n")


def git(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", "-c", "user.name=Yololoop Test", "-c", "user.email=test@example.com", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {result.stderr}")
    return result


if __name__ == "__main__":
    unittest.main()
