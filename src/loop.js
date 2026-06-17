import { runOnce } from "./run.js";
import { UserError } from "./errors.js";

export async function runLoop(cwd, options = {}) {
  const max = options.max ?? 1;
  if (!Number.isInteger(max) || max < 1) {
    throw new UserError("--max must be a positive integer");
  }

  const runs = [];

  for (let index = 0; index < max; index += 1) {
    let run;
    try {
      run = await runOnce(cwd, {
        branch: options.branch,
        commit: options.commit
      });
    } catch (error) {
      error.runs = runs;
      throw error;
    }

    runs.push(run);

    if (run.status === "empty") {
      break;
    }
  }

  return {
    status: runs.at(-1)?.status ?? "empty",
    requested: max,
    completed: runs.filter((run) => run.status === "passed").length,
    runs
  };
}
