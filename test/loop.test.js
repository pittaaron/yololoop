import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { runLoop } from "../src/loop.js";

test("runLoop executes multiple backlog items until max", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-loop-"));
  await mkdir(path.join(cwd, "scripts"));
  await writeFile(path.join(cwd, "BACKLOG.md"), [
    "- [ ] chore: First",
    "- [ ] chore: Second",
    "- [ ] chore: Third",
    ""
  ].join("\n"), "utf8");
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

  const result = await runLoop(cwd, { max: 2, branch: false, commit: false, allowNoGates: true });
  const backlog = await readFile(path.join(cwd, "BACKLOG.md"), "utf8");
  const note = await readFile(path.join(cwd, "NOTE.md"), "utf8");

  assert.equal(result.completed, 2);
  assert.match(backlog, /\[x\] chore: First/);
  assert.match(backlog, /\[x\] chore: Second/);
  assert.match(backlog, /\[ \] chore: Third/);
  assert.match(note, /chore: First/);
  assert.match(note, /chore: Second/);
});

test("runLoop with per-item branches runs each item once when origin/main exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "yololoop-loop-origin-"));
  const origin = path.join(root, "origin.git");
  const cwd = path.join(root, "work");
  await mkdir(path.join(cwd, "scripts"), { recursive: true });
  await writeFile(path.join(cwd, "BACKLOG.md"), [
    "- [ ] chore: First",
    "- [ ] chore: Second",
    "- [ ] chore: Third",
    ""
  ].join("\n"), "utf8");
  await writeFile(path.join(cwd, ".gitignore"), ".yololoop/\n", "utf8");
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

  git(root, ["init", "--bare", "origin.git"]);
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  git(cwd, ["config", "user.name", "Yololoop Test"]);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "initial"]);
  git(cwd, ["remote", "add", "origin", origin]);
  git(cwd, ["push", "-u", "origin", "main"]);

  const result = await runLoop(cwd, { max: 3, branch: true, commit: true, allowNoGates: true });
  const note = git(cwd, ["show", "chore/third:NOTE.md"]).stdout;
  const backlog = git(cwd, ["show", "chore/third:BACKLOG.md"]).stdout;

  assert.deepEqual(result.runs.map((run) => run.item.title), ["chore: First", "chore: Second", "chore: Third"]);
  assert.equal(result.completed, 3);
  assert.equal(note, "chore: First\nchore: Second\nchore: Third\n");
  assert.doesNotMatch(backlog, /\[ \]/);
});

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
