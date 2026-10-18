#!/usr/bin/env python3
"""A yololoop command route that runs the selected backlog item through Harness².

yololoop picks the item and calls this script as its route. Harness² runs the agent with the
repository's current harness (AGENTS.md, .agents/skills, .codex/hooks.json), proposes edits to
that harness from what the run did, runs the agent again with the edits, and composes a final
harness. Every run happens in its own git worktree, and the repository's yololoop gates decide
whether a run delivered. The chosen run's change is applied to the repository; yololoop then
runs its gates again and checks the item off. Lessons are kept in a per-repository library
under .yololoop/harness2/ and handed to the improver on later items.

    python3 harness2_route.py [--improver claude --model <id>] [--adopt] -- <agent command...>

The agent command runs inside each worktree. `{{prompt}}`, `{{title}}` and `{{slug}}` in its
arguments are replaced, and the YOLOLOOP_* variables are passed through.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

try:
    from harness2.core import library as h2_library
    from harness2.core import tree as h2_tree
    from harness2.core.proposer import Proposer, Reply
    from harness2.core.schedule import Namespace, mode_token, run_task
    from harness2.core.spec import BenchPrompts, BenchSpec, ChannelSpec
    from harness2.substrate.codex import CODEX_SURFACE, CodexSubstrate, render_events
except ImportError as exc:
    print(
        f"harness2_route: cannot import harness2 ({exc}). Install it from "
        "https://github.com/google-research/harness2 or put a checkout on PYTHONPATH.",
        file=sys.stderr,
    )
    sys.exit(2)

BENCH = "yololoop"
STATE_DIR = ".yololoop/harness2"
CONFIG_FILE = "yololoop.config.json"
RESULT_FILE = "result.json"
DIFF_FILE = "change.diff"
WORKTREE_PREFIX = "yololoop-h2-worktree-"

# The harness Harness² may edit. Top-level scripts/*.py is on the Codex surface too, but in a
# real repository that directory is project code, so it is never read as part of the base.
HARNESS_ROOTS = ("AGENTS.md", ".agents", ".codex")

# Dangling commits in throwaway worktrees; they must not depend on the user's git identity.
GIT_IDENTITY = (
    "-c",
    "user.name=yololoop",
    "-c",
    "user.email=yololoop@localhost",
    "-c",
    "commit.gpgsign=false",
)

TASK_PROMPT = """Complete this backlog item in the repository in your working directory:

{title}

Read AGENTS.md first and follow it. Keep the change scoped to this item, and run the
project's checks before you finish."""

TRAJECTORY_MAX_CHARS = 2_000_000


class RouteError(RuntimeError):
    """A setup or apply problem the user has to fix; printed without a traceback."""


@dataclass
class Logged:
    argv: list[str]
    returncode: int
    timed_out: bool

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out


class YololoopAdapter:
    """Harness²'s benchmark seam over one yololoop backlog item."""

    def __init__(
        self,
        repo: Path,
        *,
        title: str,
        slug: str,
        agent: list[str],
        channel: ChannelSpec,
        rollout_timeout: int,
    ):
        self.repo = repo
        self.title = title
        self.slug = slug
        self.agent = agent
        self.rollout_timeout = rollout_timeout
        self.state = repo / STATE_DIR
        self.substrate = CodexSubstrate()
        self.spec = BenchSpec(
            name=BENCH,
            runs_root=self.state / "runs",
            install_mode="codex_root",
            prompts=BenchPrompts(
                work="complete one backlog item in a software repository with a small, "
                "scoped change",
                domain_word="codebase",
                deliverable_word="change",
                yardstick="the repository's own checks pass and the change stays within "
                "the backlog item",
            ),
            channels={"proposer": channel, "selector": channel},
            domain_word="codebase",
            # Project scripts may be named in AGENTS.md without being part of the harness.
            reserved_scripts=frozenset(p.name for p in (repo / "scripts").glob("*.py")),
        )
        self.gates = read_gates(repo)
        self.base_tree = read_repo_harness(repo)
        if not self.base_tree.get("AGENTS.md", "").strip():
            raise RouteError("AGENTS.md is missing or empty; run `yololoop init` first")
        self.base_commit = snapshot_commit(repo)
        remove_stale_worktrees(repo)
        self._worktree_lock = threading.Lock()
        self._base_lock = threading.Lock()
        self._base_written = False

    def tasks(self, split: str = "all") -> list[str]:
        return [self.slug]

    def domain_of(self, task_id: str) -> str:
        return self.repo.name

    def task_prompt(self, task_id: str) -> str:
        return TASK_PROMPT.format(title=self.title)

    def task_files(self, task_id: str) -> Path | None:
        project = self.repo / "PROJECT.md"
        if not project.is_file():
            return None
        source = self.state / "source"
        source.mkdir(parents=True, exist_ok=True)
        (source / "PROJECT.md").write_text(project.read_text(encoding="utf-8"), encoding="utf-8")
        return source

    def base_harness(self) -> Path:
        base = self.state / "base_harness"
        with self._base_lock:
            if not self._base_written:
                h2_tree.write_tree(CODEX_SURFACE, self.base_tree, base, stubs=False)
                self._base_written = True
        return base

    def validate_tree(self, tree: dict[str, str]) -> None:
        clashes = [
            rel
            for rel in sorted(tree)
            if rel.startswith("scripts/") and (self.repo / rel).exists()
        ]
        if clashes:
            raise ValueError(
                "these helper scripts would overwrite project files in the repository: "
                + ", ".join(clashes)
                + ". Give each helper a name that is not already used under scripts/."
            )

    def execute(
        self, task_id: str, harness_dir: Path | None, run_id: str, *, timeout: int | None = None
    ) -> Path:
        run_dir = self.state / "rollouts" / run_id
        if (run_dir / RESULT_FILE).is_file():
            return run_dir
        run_dir.mkdir(parents=True, exist_ok=True)
        tree = h2_tree.read_tree(CODEX_SURFACE, harness_dir) if harness_dir else self.base_tree

        checks: list[dict] = []
        with tempfile.TemporaryDirectory(prefix=WORKTREE_PREFIX) as tmp:
            worktree = Path(tmp) / "work"
            with self._worktree_lock:
                git(self.repo, "worktree", "add", "--quiet", "--detach", str(worktree), self.base_commit)
            try:
                harness_commit = self._install(worktree, tree)
                agent = run_logged(
                    self.agent_argv(), worktree, run_dir / "agent", timeout or self.rollout_timeout
                )
                git(worktree, "add", "--all")
                diff = git(
                    worktree, "diff", "--cached", "--binary", harness_commit,
                    "--", ".", ":(exclude).yololoop",
                ).stdout
                (run_dir / DIFF_FILE).write_text(diff, encoding="utf-8")
                if agent.ok:
                    for index, gate in enumerate(self.gates, 1):
                        argv = [gate["command"], *gate.get("args", [])]
                        timeout_s = gate.get("timeoutSeconds") or self.rollout_timeout
                        ran = run_logged(argv, worktree, run_dir / f"check-{index}", timeout_s)
                        checks.append({
                            "name": gate.get("name") or gate["command"],
                            "argv": argv,
                            "returncode": ran.returncode,
                            "timed_out": ran.timed_out,
                            "ok": ran.ok,
                            "log": f"check-{index}",
                        })
                        if not ran.ok:
                            break
            finally:
                with self._worktree_lock:
                    git(self.repo, "worktree", "remove", "--force", str(worktree), check=False)

        result = {
            "agent": {"argv": agent.argv, "returncode": agent.returncode, "timed_out": agent.timed_out},
            "changed": bool(diff.strip()),
            "checks": checks,
            "delivered": agent.ok and bool(diff.strip()) and all(c["ok"] for c in checks),
        }
        (run_dir / RESULT_FILE).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        return run_dir

    def delivered(self, run_dir: Path) -> bool:
        result = read_result(run_dir)
        return bool(result and result["delivered"])

    def trajectory(self, run_dir: Path, *, obs_trunc: int) -> str:
        result = read_result(run_dir)
        if result is None:
            raise FileNotFoundError(f"no {RESULT_FILE} in {run_dir}")
        agent = result["agent"]
        parts = []
        if is_codex_json(agent["argv"]):
            parts.append(render_events(
                run_dir / "agent.stdout", obs_trunc=obs_trunc, max_chars=TRAJECTORY_MAX_CHARS
            ))
            if agent["returncode"] != 0:
                parts.append(observation(run_dir / "agent", agent, obs_trunc, stdout=False))
        else:
            parts.append(f"[ACTION] run the agent: {shlex.join(agent['argv'])}")
            parts.append(observation(run_dir / "agent", agent, obs_trunc))
        if agent["returncode"] == 0 and not result["changed"]:
            parts.append("[ERROR] the run left the repository unchanged")
        for check in result["checks"]:
            parts.append(
                f"[ACTION] run the repository check `{check['name']}`: {shlex.join(check['argv'])}"
            )
            parts.append(observation(run_dir / check["log"], check, obs_trunc))
        return "\n".join(parts) + "\n"

    def deliverable_text(self, run_dir: Path) -> str:
        diff = run_dir / DIFF_FILE
        return diff.read_text(encoding="utf-8", errors="replace") if diff.is_file() else ""

    def deliverable_files(self, run_dir: Path) -> dict[str, str]:
        text = self.deliverable_text(run_dir)
        return {DIFF_FILE: text} if text.strip() else {}

    def score(self, run_dir: Path, task_id: str) -> dict | None:
        result = read_result(run_dir)
        return None if result is None else {"delivered": result["delivered"]}

    def agent_argv(self) -> list[str]:
        values = {
            "{{prompt}}": self.task_prompt(self.slug),
            "{{title}}": self.title,
            "{{slug}}": self.slug,
        }
        out = []
        for arg in self.agent:
            for key, value in values.items():
                arg = arg.replace(key, value)
            out.append(arg)
        return out

    def adopt(self, tree: dict[str, str]) -> list[str]:
        """Write the chosen harness into the repository; return the paths that changed."""
        changed = []
        for rel in sorted(self.base_tree):
            if rel not in tree:
                (self.repo / rel).unlink(missing_ok=True)
                changed.append(rel)
        for rel, body in sorted(tree.items()):
            if self.base_tree.get(rel) != body:
                path = self.repo / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(body, encoding="utf-8")
                changed.append(rel)
        return changed

    def apply(self, run_dir: Path) -> None:
        applied = git(self.repo, "apply", "--whitespace=nowarn", str(run_dir / DIFF_FILE), check=False)
        if applied.returncode != 0:
            raise RouteError(
                f"could not apply {run_dir / DIFF_FILE}: {applied.stderr.strip()}. If the agent "
                "edited the harness files, rerun with --adopt so the diff applies on top of them."
            )

    def _install(self, worktree: Path, tree: dict[str, str]) -> str:
        """Lay a harness over the worktree and commit it, so the agent's diff excludes it."""
        for rel in self.base_tree:
            if rel not in tree:
                (worktree / rel).unlink(missing_ok=True)
        for rel, body in tree.items():
            path = worktree / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
        git(worktree, "add", "--all")
        git(worktree, *GIT_IDENTITY, "commit", "--quiet", "--no-verify", "--allow-empty",
            "-m", "harness2: install harness")
        return git(worktree, "rev-parse", "HEAD").stdout.strip()


class LocalClaudeImprover(Proposer):
    """Harness²'s claude_cli channel on the caller's own `claude` login.

    The stock channel forces Vertex AI and drops ANTHROPIC_API_KEY. yololoop keeps provider
    auth local, so this passes the environment through and only pins the model.
    """

    def env(self) -> dict[str, str]:
        env = dict(os.environ)
        env["ANTHROPIC_MODEL"] = self.spec.model
        return env


class ScriptedImprover(Proposer):
    """A deterministic stand-in for the improver, for the demo and tests: no model calls.

    Edit stages add one rule to AGENTS.md when a trajectory, or a lesson in the library, shows
    a file missing its final newline; reflection records a lesson when the adopted harness
    carries that rule.
    """

    RULE = "- End every file with a newline."
    SYMPTOM = "does not end with a newline"

    def call(self, mission, context_dir, label, **kwargs) -> Reply:
        context = Path(context_dir)
        workspace = None
        if label.startswith("select."):
            first = sorted((context / "candidates").glob("*.md"))[0].stem
            text = f"<why>The first candidate is as good as any here.</why>\n```choice\n{first}\n```"
        elif label.startswith("experience."):
            adopted = (context / "harness" / "AGENTS.md").read_text(encoding="utf-8")
            base = (context / "base_harness" / "AGENTS.md").read_text(encoding="utf-8")
            helped = self.RULE in adopted and self.RULE not in base
            text = (
                "<edits>\ncomponent: AGENTS.md\ncandidates: all\n"
                "change: added a rule to end every file with a newline\n"
                "observed: the unmodified run's check reported a file without a final newline\n"
                f"verdict: {'helped' if helped else 'no observed effect'}\n</edits>\n\n"
            ) + (
                "<experience>\ncue: When the repository's checks look at how files end\n"
                "lesson: Keep a rule in AGENTS.md to end every file with a newline.\n"
                "evidence: The unmodified run's check said a note does not end with a newline; "
                "the run with the rule passed the same check.\n"
                "confidence: high for this observed contrast\n</experience>"
                if helped
                else "NO_ENTRY"
            )
        else:
            workspace = context / "harness"
            agents = workspace / "AGENTS.md"
            body = agents.read_text(encoding="utf-8")
            evidence = "\n".join(
                path.read_text(encoding="utf-8", errors="replace")
                for path in sorted(context.rglob("*.md"))
                if "harness" not in path.relative_to(context).parts
            )
            if self.SYMPTOM in evidence and self.RULE not in body:
                agents.write_text(body.rstrip() + "\n" + self.RULE + "\n", encoding="utf-8")
                text = "<notes>A check failed on a missing final newline; added a rule.</notes>"
            else:
                text = "<notes>No failure in the evidence that a harness rule would fix.</notes>"
        reply = Reply(label=label, text=text, ok=True, attempts=1, workspace=workspace)
        self._calls.append(reply)
        return reply


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, stdin=subprocess.DEVNULL
    )
    if check and result.returncode != 0:
        raise RouteError(f"git {' '.join(args)} failed: {result.stderr.strip() or result.stdout.strip()}")
    return result


def run_logged(argv: list[str], cwd: Path, prefix: Path, timeout: int) -> Logged:
    """Run a command with stdout/stderr captured to `<prefix>.stdout` and `<prefix>.stderr`."""
    stdout_path = prefix.with_name(prefix.name + ".stdout")
    stderr_path = prefix.with_name(prefix.name + ".stderr")
    with stdout_path.open("w", encoding="utf-8") as out, stderr_path.open("w", encoding="utf-8") as err:
        try:
            done = subprocess.run(
                argv, cwd=cwd, stdout=out, stderr=err, stdin=subprocess.DEVNULL, timeout=timeout
            )
            return Logged(argv, done.returncode, False)
        except subprocess.TimeoutExpired:
            err.write(f"\ntimed out after {timeout}s\n")
            return Logged(argv, 124, True)
        except OSError as exc:
            err.write(f"{exc}\n")
            return Logged(argv, 127, False)


def observation(prefix: Path, ran: dict, limit: int, *, stdout: bool = True) -> str:
    def read(suffix: str) -> str:
        path = prefix.with_name(prefix.name + suffix)
        return path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""

    text = ((read(".stdout") if stdout else "") + read(".stderr")).strip()
    if len(text) > limit:
        text = text[:limit] + f"\n…(+{len(text) - limit} chars truncated)"
    if ran["returncode"] == 0:
        return "[OBSERVATION]\n" + (text or "(no output)")
    reason = "timed out" if ran.get("timed_out") else f"exit {ran['returncode']}"
    return f"[ERROR] {reason}\n{text}".rstrip()


def is_codex_json(argv: list[str]) -> bool:
    return bool(argv) and Path(argv[0]).name == "codex" and "--json" in argv


def read_result(run_dir: Path) -> dict | None:
    path = Path(run_dir) / RESULT_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def read_gates(repo: Path) -> list[dict]:
    path = repo / CONFIG_FILE
    if not path.is_file():
        return []
    try:
        gates = json.loads(path.read_text(encoding="utf-8")).get("gates", [])
    except json.JSONDecodeError as exc:
        raise RouteError(f"invalid {CONFIG_FILE}: {exc}") from exc
    return [gate for gate in gates if isinstance(gate, dict) and gate.get("command")]


def read_repo_harness(repo: Path) -> dict[str, str]:
    tree = {}
    for root in HARNESS_ROOTS:
        path = repo / root
        files = [path] if path.is_file() else sorted(path.rglob("*")) if path.is_dir() else []
        for file in files:
            rel = file.relative_to(repo).as_posix()
            if file.is_file() and "__pycache__" not in file.parts and h2_tree.is_allowed(CODEX_SURFACE, rel):
                tree[rel] = file.read_text(encoding="utf-8")
    return tree


def remove_stale_worktrees(repo: Path) -> None:
    """Remove worktrees left by an earlier route run that was killed mid-rollout.

    A timed-out route gets SIGTERM, which skips the cleanup in `execute`. Only linked
    worktrees with exactly the shape `execute` creates (<tmp>/<prefix>*/work) are touched;
    the first entry is the main worktree and is never one of them.
    """
    listed = [
        Path(line.removeprefix("worktree "))
        for line in git(repo, "worktree", "list", "--porcelain").stdout.splitlines()
        if line.startswith("worktree ")
    ]
    tmp = Path(tempfile.gettempdir()).resolve()
    for path in listed[1:]:
        ours = (
            path.name == "work"
            and path.parent.name.startswith(WORKTREE_PREFIX)
            and path.parent.parent.resolve() == tmp
            and not repo.resolve().is_relative_to(path.resolve())
        )
        if ours:
            git(repo, "worktree", "remove", "--force", str(path), check=False)
            shutil.rmtree(path.parent, ignore_errors=True)
    git(repo, "worktree", "prune", check=False)


def snapshot_commit(repo: Path) -> str:
    """The commit every worktree starts from: HEAD plus any uncommitted tracked changes."""
    head = git(repo, "rev-parse", "--verify", "HEAD", check=False)
    if head.returncode != 0:
        raise RouteError(f"{repo} needs at least one commit; harness2 runs work in git worktrees")
    stash = git(repo, *GIT_IDENTITY, "stash", "create").stdout.strip()
    return stash or head.stdout.strip()


def run_tag() -> str:
    raw = os.environ.get("YOLOLOOP_RUN_ID") or time.strftime("%Y%m%dT%H%M%S")
    return "y" + re.sub(r"[^A-Za-z0-9_.-]", "-", raw)


def make_improver(args: argparse.Namespace, audit_dir: Path) -> Proposer:
    if args.improver == "scripted":
        return ScriptedImprover(ChannelSpec("claude_cli", "scripted"), audit_dir=audit_dir)
    if not args.model:
        raise RouteError("--improver claude needs --model <Anthropic model id>")
    return LocalClaudeImprover(
        ChannelSpec("claude_cli", args.model, effort=args.effort), audit_dir=audit_dir
    )


def chosen_run(result, adapter: YololoopAdapter, mode: str, k: int, tag: str):
    """(label, run_dir, harness tree, note) for the run whose change should land, or None.

    Harness² selects among its composed finals only. If none of them delivered, a delivered
    run of the unmodified harness is still finished work, so it is used instead.
    """
    sel = result.selections.get(mode) or {}
    label, run_dir = sel.get("chosen_label"), sel.get("chosen_run_dir")
    if sel.get("ok") and label and run_dir and adapter.delivered(Path(run_dir)):
        task_dir = Namespace(BENCH, adapter.substrate.name, mode, k, tag=tag).task_dir(
            adapter.spec.runs_root, adapter.slug
        )
        harness = task_dir / "harnesses" / label
        tree = h2_tree.read_tree(CODEX_SURFACE, harness) if harness.is_dir() else adapter.base_tree
        note = "improved harness" if tree != adapter.base_tree else "no harness change needed"
        return label, Path(run_dir), tree, note
    for base in result.base:
        if adapter.delivered(Path(base["run_dir"])):
            note = "no improved run passed; using the unmodified harness's run"
            return base["label"], Path(base["run_dir"]), adapter.base_tree, note
    return None


def parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        split = argv.index("--")
        own, agent = argv[:split], argv[split + 1 :]
    else:
        own, agent = argv, []
    parser = argparse.ArgumentParser(
        prog="harness2_route.py",
        description="Run the selected yololoop backlog item through Harness².",
        usage="%(prog)s [options] -- <agent command...>",
    )
    parser.add_argument("--improver", choices=("claude", "scripted"), default="claude",
                        help="who proposes harness edits (scripted makes no model calls)")
    parser.add_argument("--model", help="Anthropic model id for --improver claude")
    parser.add_argument("--effort", default="high", help="reasoning effort for the improver")
    parser.add_argument("--k", type=int, default=1, help="task-level recursion budget")
    parser.add_argument("--mode", choices=("parallel", "sequential"), default="parallel")
    parser.add_argument("--adopt", action="store_true",
                        help="write the chosen harness into the repository so it is committed")
    parser.add_argument("--rollout-timeout", type=int, default=900,
                        help="seconds for one agent run, and for each check without its own")
    args = parser.parse_args(own)
    if not agent:
        parser.error("give the agent command after --")
    if args.k < 1:
        parser.error("--k must be positive")
    args.agent = agent
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    repo = Path(os.environ.get("YOLOLOOP_REPO") or os.getcwd()).resolve()
    title = os.environ.get("YOLOLOOP_ITEM_TITLE", "").strip()
    if not title:
        raise RouteError("YOLOLOOP_ITEM_TITLE is not set; run this script as a yololoop route")
    slug = os.environ.get("YOLOLOOP_ITEM_SLUG") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    tag = run_tag()
    mode = mode_token(args.mode)

    state = repo / STATE_DIR
    improver = make_improver(args, state / "improver")
    adapter = YololoopAdapter(
        repo,
        title=title,
        slug=slug,
        agent=args.agent,
        channel=improver.spec,
        rollout_timeout=args.rollout_timeout,
    )
    library = h2_library.Library(
        root=state / "library" / mode, domain=adapter.domain_of(slug), surface=CODEX_SURFACE
    )

    print(f"harness2: {title} (k={args.k}, {args.mode}, improver={args.improver})", flush=True)
    result = run_task(
        slug,
        args.k,
        adapter=adapter,
        prop=improver,
        runs_root=adapter.spec.runs_root,
        modes=(mode,),
        tag=tag,
        libraries={mode: library},
        selector_prop=improver,
    )
    for error in result.errors:
        print(f"harness2: {error}", flush=True)

    chosen = chosen_run(result, adapter, mode, args.k, tag)
    if chosen is None:
        print("harness2: no run passed the repository checks; nothing applied", flush=True)
        return 1
    label, run_dir, tree, note = chosen
    print(f"harness2: chose {label} ({note})", flush=True)

    if args.adopt and tree != adapter.base_tree:
        changed = adapter.adopt(tree)
        print(f"harness2: adopted harness changes: {', '.join(changed)}", flush=True)
    adapter.apply(run_dir)
    print(f"harness2: applied {(run_dir / DIFF_FILE).relative_to(repo)}", flush=True)
    print(f"harness2: library has {len(library.entries())} lesson(s) for {library.domain}", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RouteError as exc:
        print(f"harness2_route: {exc}", file=sys.stderr)
        sys.exit(2)
