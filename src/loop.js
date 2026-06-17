import { runOnce } from "./run.js";
import { readConfig } from "./config.js";
import { UserError } from "./errors.js";

export async function runLoop(cwd, options = {}) {
  const config = await readConfig(cwd);
  const max = options.max ?? 1;
  if (!Number.isInteger(max) || max < 1) {
    throw new UserError("--max must be a positive integer");
  }

  const sleepSeconds = options.sleepSeconds ?? config.runtime?.sleepSeconds ?? 0;
  const maxRuntimeSeconds = options.maxRuntimeSeconds ?? config.runtime?.maxRuntimeSeconds ?? 0;
  const startedMs = Date.now();
  const runs = [];

  for (let index = 0; index < max; index += 1) {
    if (maxRuntimeSeconds > 0 && (Date.now() - startedMs) / 1000 >= maxRuntimeSeconds) {
      break;
    }

    let run;
    try {
      run = await runOnce(cwd, {
        branch: options.branch,
        branchName: options.branchName,
        commit: options.commit,
        timeoutSeconds: options.timeoutSeconds,
        stream: options.stream
      });
    } catch (error) {
      error.runs = runs;
      throw error;
    }

    runs.push(run);

    if (run.status === "empty") {
      break;
    }

    if (sleepSeconds > 0 && index < max - 1) {
      await sleep(sleepSeconds);
    }
  }

  return {
    status: runs.at(-1)?.status ?? "empty",
    requested: max,
    completed: runs.filter((run) => run.status === "passed").length,
    durationSeconds: Math.round((Date.now() - startedMs) / 1000),
    runs
  };
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
