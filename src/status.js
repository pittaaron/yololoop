import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readBacklog } from "./backlog.js";

export async function getStatus(cwd) {
  const backlog = await readBacklog(cwd);
  const latestRun = await readLatestJson(cwd, ".yololoop/runs");
  const latestPlan = await readLatestJson(cwd, ".yololoop/plans");

  return {
    uncheckedItems: backlog.items.length,
    nextItem: backlog.items[0] ?? null,
    latestPlan,
    latestRun
  };
}

export async function readLatestJson(cwd, relativeDir) {
  const absoluteDir = path.join(cwd, relativeDir);
  let entries;

  try {
    entries = await readdir(absoluteDir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter((entry) => entry.endsWith(".json")).sort();
  const latest = jsonFiles.at(-1);
  if (!latest) {
    return null;
  }

  const text = await readFile(path.join(absoluteDir, latest), "utf8");
  return JSON.parse(text);
}
