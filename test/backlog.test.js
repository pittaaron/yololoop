import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyBacklogTitle, markItemDone, parseBacklog } from "../src/backlog.js";

test("parseBacklog returns unchecked items with type and slug", () => {
  const items = parseBacklog(`# Backlog

- [x] chore: already done
- [ ] chore: Add parser tests
- [ ] bug: Fix status output
- [ ] proposal: Design hosted runs
`);

  assert.equal(items.length, 3);
  assert.deepEqual(items.map((item) => item.type), ["chore", "bug", "proposal"]);
  assert.equal(items[0].slug, "add-parser-tests");
});

test("classifyBacklogTitle defaults to chore", () => {
  assert.equal(classifyBacklogTitle("update README"), "chore");
  assert.equal(classifyBacklogTitle("feature: add route policies"), "proposal");
  assert.equal(classifyBacklogTitle("fix: mark failed gate"), "bug");
});

test("markItemDone tolerates an item already checked off by the route", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-backlog-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [x] chore: Done elsewhere\n", "utf8");

  await markItemDone(cwd, {
    lineIndex: 0
  });

  assert.equal(await readFile(path.join(cwd, "BACKLOG.md"), "utf8"), "- [x] chore: Done elsewhere\n");
});
