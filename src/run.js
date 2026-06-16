import { spawnSync } from "node:child_process";
import { readConfig } from "./config.js";
import { markItemDone } from "./backlog.js";
import { ensureDir, writeJson } from "./fs-utils.js";
import { createPlan } from "./plan.js";
import { ensureGitRepo, checkoutBranch } from "./git.js";
import { UserError } from "./errors.js";

export async function runOnce(cwd, options = {}) {
  const plan = await createPlan(cwd, { branch: options.branch });

  if (plan.status === "empty") {
    return writeRun(cwd, {
      ...baseRun(plan),
      status: "empty",
      command: null,
      gates: []
    });
  }

  const config = await readConfig(cwd);
  const route = config.routes[plan.item.type] ?? config.routes.chore;

  if (route.mode === "manual") {
    const message = route.message ?? `route ${plan.item.type} is manual`;
    await writeRun(cwd, {
      ...baseRun(plan),
      status: "blocked",
      error: message,
      command: null,
      gates: []
    });
    throw new UserError(message, 2);
  }

  if (plan.branch.enabled) {
    ensureGitRepo(cwd);
    checkoutBranch(cwd, plan.branch.name);
  }

  const commandResult = runCommand(cwd, route, plan);
  const gateResults = commandResult.ok
    ? config.gates.map((gate) => runCommand(cwd, gate, plan))
    : [];

  const ok = commandResult.ok && gateResults.every((gate) => gate.ok);
  const run = await writeRun(cwd, {
    ...baseRun(plan),
    status: ok ? "passed" : "failed",
    command: commandResult,
    gates: gateResults
  });

  if (!ok) {
    throw new UserError("route or gate failed; see .yololoop/runs for details", 1);
  }

  await markItemDone(cwd, plan.item);
  return run;
}

function runCommand(cwd, commandShape, plan) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(commandShape.command, commandShape.args ?? [], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      YOLOLOOP_ITEM_TITLE: plan.item.title,
      YOLOLOOP_ITEM_TYPE: plan.item.type,
      YOLOLOOP_ITEM_SLUG: plan.item.slug,
      YOLOLOOP_BRANCH: plan.branch.name,
      YOLOLOOP_REPO: cwd
    },
    shell: false
  });

  return {
    name: commandShape.name,
    command: commandShape.command,
    args: commandShape.args ?? [],
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message
  };
}

function baseRun(plan) {
  return {
    version: 0,
    createdAt: new Date().toISOString(),
    planCreatedAt: plan.createdAt,
    item: plan.item,
    branch: plan.branch
  };
}

async function writeRun(cwd, run) {
  await ensureDir(cwd, ".yololoop/runs");
  const stamp = run.createdAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const relativePath = `.yololoop/runs/run-${stamp}.json`;
  const nextRun = { ...run, path: relativePath };
  await writeJson(cwd, relativePath, nextRun);
  return nextRun;
}
