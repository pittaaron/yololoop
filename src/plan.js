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
  const branchName = `${item.type}/${item.slug}`;
  const branchEnabled = options.branch !== false;

  return {
    version: 0,
    createdAt,
    status: route.mode === "manual" ? "blocked" : "ready",
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
      route.mode === "manual"
        ? `stop: ${route.message ?? "route is manual"}`
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

function redactRoute(route) {
  if (route.mode === "manual") {
    return {
      mode: "manual",
      message: route.message
    };
  }

  return {
    mode: "command",
    command: route.command,
    args: route.args ?? []
  };
}
