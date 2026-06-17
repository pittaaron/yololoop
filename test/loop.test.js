import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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

  const result = await runLoop(cwd, { max: 2, branch: false, commit: false });
  const backlog = await readFile(path.join(cwd, "BACKLOG.md"), "utf8");
  const note = await readFile(path.join(cwd, "NOTE.md"), "utf8");

  assert.equal(result.completed, 2);
  assert.match(backlog, /\[x\] chore: First/);
  assert.match(backlog, /\[x\] chore: Second/);
  assert.match(backlog, /\[ \] chore: Third/);
  assert.match(note, /chore: First/);
  assert.match(note, /chore: Second/);
});
