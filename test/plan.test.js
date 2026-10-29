import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createPlan } from "../src/plan.js";

test("createPlan selects first backlog item and computes branch", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-plan-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] bug: Fix flaky gate\n", "utf8");

  const plan = await createPlan(cwd);

  assert.equal(plan.status, "blocked");
  assert.equal(plan.item.type, "bug");
  assert.equal(plan.branch.name, "bug/fix-flaky-gate");
  assert.equal(plan.route.mode, "manual");
});

test("createPlan blocks a command route with no gates unless allowed", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "yololoop-plan-gates-"));
  await writeFile(path.join(cwd, "BACKLOG.md"), "- [ ] chore: Ship it\n", "utf8");
  await writeFile(path.join(cwd, "yololoop.config.json"), JSON.stringify({
    version: 0,
    routes: { chore: { mode: "command", command: "true" } },
    gates: []
  }), "utf8");

  const blocked = await createPlan(cwd);
  const allowed = await createPlan(cwd, { allowNoGates: true });

  assert.equal(blocked.status, "blocked");
  assert.match(blocked.blockedReason, /no gates configured/);
  assert.match(blocked.actions.join("\n"), /stop: no gates configured/);
  assert.equal(allowed.status, "ready");
});
