import { readConfig } from "./config.js";
import { selectNextItem } from "./backlog.js";
import { ensureDir, writeJson } from "./fs-utils.js";

export async function createPlan(cwd, options = {}) {
  const config = await readConfig(cwd);
  const item = await selectNextItem(cwd);
  const createdAt = new Date().toISOString();

  if (!item) {
    return {
      version: 0,
      createdAt,
      status: "empty",
      message: "No unchecked backlog items found.",
      actions: []
    };
  }

  const route = config.routes[item.type] ?? config.routes.chore;
  const branchName = options.branchName ?? `${item.type}/${item.slug}`;
  const branchEnabled = options.branch !== false;
  const blockedReason = blockReason(route, item, config, options);

  return {
    version: 0,
    createdAt,
    status: blockedReason ? "blocked" : "ready",
    ...(blockedReason ? { blockedReason } : {}),
    item,
    route: redactRoute(route),
    branch: {
      enabled: branchEnabled,
      name: branchName
    },
    gates: config.gates.map((gate) => ({
      name: gate.name,
      command: gate.command,
      args: gate.args ?? []
    })),
    actions: [
      ...(branchEnabled ? [`create or reuse branch ${branchName}`] : []),
      blockedReason
        ? `stop: ${blockedReason}`
        : `run command route for ${item.type}`,
      "run configured gates",
      "mark backlog item complete after successful route and gates",
      "write .yololoop run artifact"
    ]
  };
}

export async function writePlan(cwd, plan) {
  await ensureDir(cwd, ".yololoop/plans");
  const stamp = plan.createdAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const relativePath = `.yololoop/plans/plan-${stamp}.json`;
  await writeJson(cwd, relativePath, plan);
  return relativePath;
}

// Gates are the only check that an item is done: agents exit 0 whether or not they finished,
// so a live run without gates would mark every item complete.
function blockReason(route, item, config, options) {
  if (route.mode === "manual") {
    return route.message ?? `route ${item.type} is manual`;
  }

  if (config.gates.length === 0 && !options.allowNoGates) {
    return "no gates configured; add a gate to yololoop.config.json that proves the item is done, or pass --allow-no-gates";
  }

  return null;
}

function redactRoute(route) {
  if (route.mode === "manual") {
    return {
      mode: "manual",
      message: route.message
    };
  }

  if (route.mode === "model") {
    return {
      mode: "model",
      runner: route.runner,
      model: route.model,
      args: route.args ?? [],
      timeoutSeconds: route.timeoutSeconds
    };
  }

  return {
    mode: "command",
    command: route.command,
    args: route.args ?? [],
    timeoutSeconds: route.timeoutSeconds
  };
}
