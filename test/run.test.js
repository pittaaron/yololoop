import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { runOnce } from "../src/run.js";

test("runOnce executes a command route, gates it, and marks backlog done", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-run-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Write note\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/write-note.mjs"]
      }
    },
    gates: [
      {
        name: "note-exists",
        command: process.execPath,
        args: ["scripts/assert-note.mjs"]
      }
    ]
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/write-note.mjs"), `
import { writeFile } from "node:fs/promises";
await writeFile("NOTE.md", process.env.YOLOLOOP_ITEM_TITLE, "utf8");
`, "utf8");
  await writeFile(path.join(cwd, "scripts/assert-note.mjs"), `
import { readFile } from "node:fs/promises";
const note = await readFile("NOTE.md", "utf8");
if (!note.includes("Write note")) process.exit(1);
`, "utf8");

  const run = await runOnce(cwd, { branch: false });
  const backlog = await readFile(path.join(cwd, "BACKLOG.md"), "utf8");
  const note = await readFile(path.join(cwd, "NOTE.md"), "utf8");

  assert.equal(run.status, "passed");
  assert.match(run.blocksPath, /\.yololoop\/runs\/.+\/blocks\.jsonl/);
  assert.match(backlog, /\[x\] chore: Write note/);
  assert.equal(note, "chore: Write note");
});

test("runOnce commits passed branch-backed work when requested", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-commit-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Commit note\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/write-note.mjs"]
      }
    },
    gates: []
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/write-note.mjs"), `
import { writeFile } from "node:fs/promises";
await writeFile("NOTE.md", process.env.YOLOLOOP_ITEM_TITLE, "utf8");
`, "utf8");

  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);

  const run = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });
  const log = git(cwd, ["log", "--oneline", "-1"]).stdout;
  const artifact = JSON.parse(await readFile(path.join(cwd, run.path), "utf8"));

  assert.equal(run.status, "passed");
  assert.equal(run.commit.committed, true);
  assert.equal(artifact.commit.committed, true);
  assert.equal(artifact.commit.sha, run.commit.sha);
  assert.match(log, /yololoop: chore: Commit note/);
});

test("runOnce commit excludes .yololoop runtime artifacts", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-commit-state-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Commit without state\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/write-note.mjs"]
      }
    },
    gates: []
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/write-note.mjs"), `
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".yololoop/manual", { recursive: true });
await writeFile(".yololoop/manual/state.json", "{}", "utf8");
await writeFile("NOTE.md", process.env.YOLOLOOP_ITEM_TITLE, "utf8");
`, "utf8");

  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);

  const run = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });
  const tree = git(cwd, ["ls-tree", "-r", "--name-only", "HEAD"]).stdout;

  assert.equal(run.status, "passed");
  assert.equal(run.commit.committed, true);
  assert.doesNotMatch(tree, /^\.yololoop\//m);
  assert.match(tree, /^NOTE\.md$/m);
});

test("runOnce does not fail commit when only runtime artifacts changed", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-only-state-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Only state\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/write-state.mjs"]
      }
    },
    gates: []
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/write-state.mjs"), `
import { mkdir, writeFile } from "node:fs/promises";
await mkdir(".yololoop/manual", { recursive: true });
await writeFile(".yololoop/manual/state.json", "{}", "utf8");
`, "utf8");

  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);

  const run = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });

  assert.equal(run.status, "passed");
  assert.equal(run.commit.committed, true);
});

test("runOnce records block history for routes and gates", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-blocks-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Record blocks\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/write-note.mjs"]
      }
    },
    gates: [
      {
        name: "pass",
        command: process.execPath,
        args: ["-e", "process.exit(0)"]
      }
    ]
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/write-note.mjs"), `
import { writeFile } from "node:fs/promises";
await writeFile("NOTE.md", "ok", "utf8");
`, "utf8");

  const run = await runOnce(cwd, { branch: false });
  const blocks = await readFile(path.join(cwd, run.blocksPath), "utf8");

  assert.equal(run.status, "passed");
  assert.equal(blocks.trim().split("\n").length, 2);
  assert.match(blocks, /"runner":"command"/);
});

test("runOnce fails timed out routes without marking backlog done", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-timeout-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Time out\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/sleep.mjs"],
        timeoutSeconds: 1
      }
    },
    gates: []
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/sleep.mjs"), `
await new Promise((resolve) => setTimeout(resolve, 5000));
`, "utf8");

  await assert.rejects(() => runOnce(cwd, { branch: false, allowNoGates: true }), /route or gate failed/);

  const backlog = await readFile(path.join(cwd, "BACKLOG.md"), "utf8");
  const runFiles = (await readdir(path.join(cwd, ".yololoop/runs"))).filter((entry) => entry.endsWith(".json"));
  const run = JSON.parse(await readFile(path.join(cwd, ".yololoop/runs", runFiles.at(-1)), "utf8"));

  assert.match(backlog, /\[ \] chore: Time out/);
  assert.equal(run.status, "failed");
  assert.equal(run.command.timedOut, true);
  assert.equal(run.command.status, 124);
});

test("runOnce skips an item already checked off on its existing branch", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-skip-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, ".gitignore"), ".yololoop/\n", "utf8");
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Done on branch\n- [ ] chore: Next\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: process.execPath,
        args: ["scripts/append-note.mjs"]
      }
    },
    gates: []
  }), "utf8");
  await writeFile(path.join(cwd, "scripts/append-note.mjs"), `
import { appendFile } from "node:fs/promises";
await appendFile("NOTE.md", process.env.YOLOLOOP_ITEM_TITLE + "\\n", "utf8");
`, "utf8");

  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);

  const first = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });
  git(cwd, ["checkout", "main"]);
  const again = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });
  const note = git(cwd, ["show", "chore/done-on-branch:NOTE.md"]).stdout;

  assert.equal(first.status, "passed");
  assert.equal(again.status, "skipped");
  assert.equal(again.command, null);
  assert.equal(note, "chore: Done on branch\n");
});

test("runOnce refuses live work without gates unless allowed", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-no-gates-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Unchecked work\n", "utf8");
  await writeConfig(cwd, { mode: "command", command: process.execPath, args: ["-e", "require('fs').writeFileSync('NOTE.md', 'x')"] }, []);

  await assert.rejects(() => runOnce(cwd, { branch: false }), /no gates configured/);

  assert.equal(existsSync(path.join(cwd, "NOTE.md")), false);
  assert.match(await readFile(path.join(cwd, "BACKLOG.md"), "utf8"), /\[ \] chore: Unchecked work/);
  assert.equal((await latestRun(cwd)).status, "blocked");

  const run = await runOnce(cwd, { branch: false, allowNoGates: true });

  assert.equal(run.status, "passed");
});

test("runOnce --commit refuses a dirty working tree but ignores yololoop state", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-dirty-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Clean commit\n", "utf8");
  await writeConfig(cwd, { mode: "command", command: process.execPath, args: ["-e", "require('fs').writeFileSync('NOTE.md', 'x')"] }, []);
  initRepo(cwd);
  await mkdir(path.join(cwd, ".yololoop/old"), { recursive: true });
  await writeFile(path.join(cwd, ".yololoop/old/state.json"), "{}", "utf8");
  await writeFile(path.join(cwd, "scratch-notes.txt"), "personal", "utf8");

  await assert.rejects(
    () => runOnce(cwd, { branch: true, commit: true, allowNoGates: true }),
    (error) => /uncommitted changes \(scratch-notes\.txt\)/.test(error.message)
  );
  assert.equal(existsSync(path.join(cwd, "NOTE.md")), false);
  assert.equal(git(cwd, ["branch", "--show-current"]).stdout.trim(), "main");

  await rm(path.join(cwd, "scratch-notes.txt"));
  const run = await runOnce(cwd, { branch: true, commit: true, allowNoGates: true });
  const tree = git(cwd, ["ls-tree", "-r", "--name-only", "HEAD"]).stdout;

  assert.equal(run.status, "passed");
  assert.doesNotMatch(tree, /scratch-notes|^\.yololoop\//m);
});

test("runOnce stops background processes a timed-out route started", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-orphan-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Hang\n", "utf8");
  await writeConfig(cwd, {
    mode: "command",
    command: "sh",
    args: ["-c", "(sleep 2; echo late > LATE.md) & wait"],
    timeoutSeconds: 1
  }, []);

  await assert.rejects(() => runOnce(cwd, { branch: false, allowNoGates: true }), /route or gate failed/);
  await delay(2500);

  assert.equal(existsSync(path.join(cwd, "LATE.md")), false);
});

test("runOnce stops background processes a finished route left running", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-leftover-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Leave a process\n", "utf8");
  await writeConfig(cwd, {
    mode: "command",
    command: "sh",
    args: ["-c", "(sleep 2; echo late > LATE.md) > /dev/null 2>&1 &"]
  }, []);

  const run = await runOnce(cwd, { branch: false, allowNoGates: true });
  await delay(2500);

  assert.equal(run.status, "passed");
  assert.equal(existsSync(path.join(cwd, "LATE.md")), false);
});

test("stopping yololoop also stops the route's processes", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-signal-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Get interrupted\n", "utf8");
  await writeConfig(cwd, {
    mode: "command",
    command: "sh",
    args: ["-c", "touch STARTED; (sleep 2; echo late > LATE.md) & wait"]
  }, []);
  const bin = fileURLToPath(new URL("../bin/yololoop.js", import.meta.url));

  const cli = spawn(process.execPath, [bin, "run", "--once", "--no-branch", "--allow-no-gates"], { cwd, stdio: "ignore" });
  let exitedEarly = false;
  const exited = new Promise((resolve) => cli.on("exit", (code) => {
    exitedEarly = true;
    resolve(code);
  }));
  while (!existsSync(path.join(cwd, "STARTED"))) {
    assert.equal(exitedEarly, false, "yololoop exited before the route started");
    await delay(50);
  }
  cli.kill("SIGTERM");
  const code = await exited;
  await delay(2500);

  assert.equal(code, 143);
  assert.equal(existsSync(path.join(cwd, "LATE.md")), false);
});

test("an interrupted run is not marked done even if the route exits 0", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-trap-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Exit cleanly when stopped\n", "utf8");
  await writeConfig(cwd, {
    mode: "command",
    command: "sh",
    args: ["-c", "trap 'echo done > NOTE.md; exit 0' TERM; touch STARTED; sleep 30 & wait"]
  }, []);
  const bin = fileURLToPath(new URL("../bin/yololoop.js", import.meta.url));

  const cli = spawn(process.execPath, [bin, "run", "--once", "--no-branch", "--allow-no-gates"], { cwd, stdio: "ignore" });
  const exited = new Promise((resolve) => cli.on("exit", (code) => resolve(code)));
  while (!existsSync(path.join(cwd, "STARTED"))) {
    await delay(50);
  }
  cli.kill("SIGTERM");
  const code = await exited;

  assert.equal(code, 143);
  assert.equal(existsSync(path.join(cwd, "NOTE.md")), true);
  assert.match(await readFile(path.join(cwd, "BACKLOG.md"), "utf8"), /\[ \] chore: Exit cleanly when stopped/);
  assert.equal((await latestRun(cwd)).status, "failed");
});

async function writeConfig(cwd, route, gates) {
  await writeFile(path.join(cwd, ".gitignore"), ".yololoop/\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: { chore: route },
    gates
  }), "utf8");
}

function initRepo(cwd) {
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);
}

async function latestRun(cwd) {
  const runFiles = (await readdir(path.join(cwd, ".yololoop/runs"))).filter((entry) => entry.endsWith(".json"));
  return JSON.parse(await readFile(path.join(cwd, ".yololoop/runs", runFiles.sort().at(-1)), "utf8"));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
