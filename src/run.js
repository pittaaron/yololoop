import { spawn } from "node:child_process";
import path from "node:path";
import { appendFile } from "node:fs/promises";
import { readConfig } from "./config.js";
import { markItemDone } from "./backlog.js";
import { ensureDir, writeJson } from "./fs-utils.js";
import { createPlan } from "./plan.js";
import { ensureGitRepo, checkoutBranch, commitAll } from "./git.js";
import { UserError } from "./errors.js";

export async function runOnce(cwd, options = {}) {
  const createdAt = new Date().toISOString();
  const runId = runStamp(createdAt);
  const plan = await createPlan(cwd, {
    branch: options.branch,
    branchName: options.branchName
  });

  if (plan.status === "empty") {
    return writeRun(cwd, {
      ...baseRun(plan),
      createdAt,
      runId,
      status: "empty",
      command: null,
      gates: []
    });
  }

  const config = await readConfig(cwd);
  const route = config.routes[plan.item.type] ?? config.routes.chore;
  const runtime = {
    ...config.runtime,
    defaultTimeoutSeconds: options.timeoutSeconds ?? config.runtime?.defaultTimeoutSeconds ?? envInteger("YOLOLOOP_TURN_TIMEOUT", 900)
  };

  if (route.mode === "manual") {
    const message = route.message ?? `route ${plan.item.type} is manual`;
    await writeRun(cwd, {
      ...baseRun(plan),
      createdAt,
      runId,
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

  const blocksPath = `.yololoop/runs/${runId}/blocks.jsonl`;
  await ensureDir(cwd, path.dirname(blocksPath));
  const commandResult = await runCommand(cwd, resolveRoute(route, config, plan), plan, {
    runId,
    blocksPath,
    timeoutSeconds: runtime.defaultTimeoutSeconds,
    stream: options.stream ?? false
  });
  const gateResults = commandResult.ok
    ? await runGates(cwd, config.gates, plan, {
      runId,
      blocksPath,
      timeoutSeconds: runtime.defaultTimeoutSeconds,
      stream: options.stream ?? false
    })
    : [];

  const ok = commandResult.ok && gateResults.every((gate) => gate.ok);
  let run = await writeRun(cwd, {
    ...baseRun(plan),
    createdAt,
    runId,
    status: ok ? "passed" : "failed",
    command: commandResult,
    gates: gateResults,
    commit: null,
    blocksPath
  });

  if (!ok) {
    throw new UserError("route or gate failed; see .yololoop/runs for details", 1);
  }

  await markItemDone(cwd, plan.item);

  if (options.commit && plan.branch.enabled) {
    const commit = commitAll(cwd, `yololoop: ${plan.item.title}`);
    run = await writeRun(cwd, {
      ...run,
      commit
    });
  }

  return run;
}

async function runGates(cwd, gates, plan, options) {
  const results = [];

  for (const gate of gates) {
    const result = await runCommand(cwd, gate, plan, options);
    results.push(result);
    if (!result.ok) {
      break;
    }
  }

  return results;
}

function resolveRoute(route, config, plan) {
  if (route.mode !== "model") {
    return route;
  }

  const resolvedModel = config.models?.[route.model] ?? route.model;
  const runner = route.runner ?? modelRunner(resolvedModel);
  const prompt = route.prompt ?? defaultModelPrompt();
  const renderedPrompt = renderPrompt(prompt, plan);

  if (runner === "codex") {
    return {
      name: route.name ?? `codex:${resolvedModel}`,
      mode: "command",
      runner,
      model: resolvedModel,
      command: route.command ?? "codex",
      args: [
        "exec",
        "--model",
        resolvedModel,
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        ...(route.args ?? []),
        renderedPrompt
      ],
      timeoutSeconds: route.timeoutSeconds
    };
  }

  if (runner === "claude") {
    return {
      name: route.name ?? `claude:${resolvedModel}`,
      mode: "command",
      runner,
      model: resolvedModel,
      command: route.command ?? "claude",
      args: [
        "--model",
        resolvedModel,
        ...(route.args ?? []),
        "-p",
        renderedPrompt
      ],
      timeoutSeconds: route.timeoutSeconds
    };
  }

  throw new UserError(`unsupported model runner ${runner}`);
}

function modelRunner(model) {
  if (/^(claude|opus|sonnet|haiku)/.test(model)) {
    return "claude";
  }

  if (/^(gpt|o[0-9]|codex)/.test(model)) {
    return "codex";
  }

  return "codex";
}

function defaultModelPrompt() {
  return [
    "You are operating inside a yololoop run.",
    "Read AGENTS.md, PROJECT.md, BACKLOG.md, and yololoop.config.json.",
    "Implement only the selected backlog item: {{title}}.",
    "Keep changes scoped. Run the project gates if the route prompt requires them.",
    "Exit nonzero if the work is incomplete or unsafe."
  ].join("\n");
}

function renderPrompt(prompt, plan) {
  return prompt
    .replaceAll("{{title}}", plan.item.title)
    .replaceAll("{{type}}", plan.item.type)
    .replaceAll("{{slug}}", plan.item.slug)
    .replaceAll("{{branch}}", plan.branch.name);
}

async function runCommand(cwd, commandShape, plan, options = {}) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const timeoutSeconds = commandShape.timeoutSeconds ?? options.timeoutSeconds ?? 900;
  const result = await spawnCommand(commandShape.command, commandShape.args ?? [], {
    cwd,
    env: {
      ...process.env,
      YOLOLOOP_ITEM_TITLE: plan.item.title,
      YOLOLOOP_ITEM_TYPE: plan.item.type,
      YOLOLOOP_ITEM_SLUG: plan.item.slug,
      YOLOLOOP_BRANCH: plan.branch.name,
      YOLOLOOP_REPO: cwd,
      YOLOLOOP_RUN_ID: options.runId ?? "",
      YOLOLOOP_MODEL: commandShape.model ?? ""
    },
    timeoutSeconds,
    stream: options.stream ?? false
  });

  const block = {
    name: commandShape.name,
    command: commandShape.command,
    args: commandShape.args ?? [],
    runner: commandShape.runner ?? "command",
    model: commandShape.model ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    signal: result.signal,
    durationSeconds: Math.round((Date.now() - startedMs) / 1000),
    timedOut: result.timedOut,
    ok: result.status === 0 && !result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error
  };

  if (options.blocksPath) {
    await appendBlock(cwd, options.blocksPath, block);
  }

  return block;
}

function baseRun(plan) {
  return {
    version: 0,
    planCreatedAt: plan.createdAt,
    item: plan.item,
    branch: plan.branch
  };
}

async function writeRun(cwd, run) {
  await ensureDir(cwd, ".yololoop/runs");
  const stamp = run.runId ?? runStamp(run.createdAt);
  const relativePath = `.yololoop/runs/run-${stamp}.json`;
  const nextRun = { ...run, path: relativePath };
  await writeJson(cwd, relativePath, nextRun);
  return nextRun;
}

function spawnCommand(command, args, options) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child;

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({
        status: null,
        signal: null,
        stdout,
        stderr,
        timedOut,
        error: error.message
      });
      return;
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 1000).unref();
    }, options.timeoutSeconds * 1000);
    timeout.unref();

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.stream) {
        process.stdout.write(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.stream) {
        process.stderr.write(text);
      }
    });

    child.on("error", (error) => {
      stderr += `${error.message}\n`;
    });

    child.on("close", (status, signal) => {
      settled = true;
      clearTimeout(timeout);
      resolve({
        status: timedOut ? 124 : status,
        signal,
        stdout,
        stderr,
        timedOut,
        error: timedOut ? `command timed out after ${options.timeoutSeconds}s` : undefined
      });
    });
  });
}

async function appendBlock(cwd, relativePath, block) {
  await appendFile(path.join(cwd, relativePath), `${JSON.stringify({
    ts: block.finishedAt,
    name: block.name ?? block.command,
    runner: block.runner,
    model: block.model,
    rc: block.status,
    duration_s: block.durationSeconds,
    ok: block.ok,
    timed_out: block.timedOut
  })}\n`, "utf8");
}

function runStamp(isoString) {
  return isoString.replace(/[-:]/g, "").replace(".", "-");
}

function envInteger(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
