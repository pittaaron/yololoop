import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

  const run = await runOnce(cwd, { branch: true, commit: true });
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

  const run = await runOnce(cwd, { branch: true, commit: true });
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

  const run = await runOnce(cwd, { branch: true, commit: true });

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

  await assert.rejects(() => runOnce(cwd, { branch: false }), /route or gate failed/);

  const backlog = await readFile(path.join(cwd, "BACKLOG.md"), "utf8");
  const runFiles = (await readdir(path.join(cwd, ".yololoop/runs"))).filter((entry) => entry.endsWith(".json"));
  const run = JSON.parse(await readFile(path.join(cwd, ".yololoop/runs", runFiles.at(-1)), "utf8"));

  assert.match(backlog, /\[ \] chore: Time out/);
  assert.equal(run.status, "failed");
  assert.equal(run.command.timedOut, true);
  assert.equal(run.command.status, 124);
});

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
