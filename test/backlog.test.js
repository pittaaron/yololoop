import test from "node:test";
import assert from "node:assert/strict";
import { classifyBacklogTitle, parseBacklog } from "../src/backlog.js";

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
