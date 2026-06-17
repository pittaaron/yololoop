import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
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

  assert.equal(run.status, "passed");
  assert.equal(run.commit.committed, true);
  assert.match(log, /yololoop: chore: Commit note/);
});

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}
