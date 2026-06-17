import { spawnSync } from "node:child_process";
import { UserError } from "./errors.js";

export function ensureGitRepo(cwd) {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0 || result.stdout.trim() !== "true") {
    throw new UserError("run requires a git repository; use --no-branch only for demos/tests");
  }
}

export function currentBranch(cwd) {
  return runGit(cwd, ["branch", "--show-current"]).stdout.trim();
}

export function checkoutBranch(cwd, branchName) {
  const current = currentBranch(cwd);

  if (current === branchName) {
    return { changed: false, branchName };
  }

  let args;
  if (gitRefExists(cwd, branchName)) {
    args = ["checkout", branchName];
  } else if (gitRefExists(cwd, `origin/${branchName}`)) {
    args = ["checkout", "-b", branchName, `origin/${branchName}`];
  } else if (gitRefExists(cwd, "origin/main")) {
    runGit(cwd, ["fetch", "--quiet", "origin", "main"], { allowFailure: true });
    args = ["checkout", "-b", branchName, "origin/main"];
  } else {
    args = ["checkout", "-b", branchName];
  }

  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new UserError(`failed to checkout ${branchName}: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return { changed: true, branchName };
}

export function hasChanges(cwd) {
  return runGit(cwd, ["status", "--porcelain"]).stdout.trim().length > 0;
}

export function commitAll(cwd, message) {
  if (!hasChanges(cwd)) {
    return { committed: false, sha: null };
  }

  runGit(cwd, ["add", "--all"]);
  runGit(cwd, ["reset", "--quiet", "--", ".yololoop"], { allowFailure: true });
  if (!hasStagedChanges(cwd)) {
    return { committed: false, sha: null };
  }

  runGit(cwd, ["commit", "-m", message]);
  const sha = runGit(cwd, ["rev-parse", "HEAD"]).stdout.trim();
  return { committed: true, sha };
}

export function runGit(cwd, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    if (options.allowFailure) {
      return result;
    }
    throw new UserError(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return result;
}

function gitRefExists(cwd, ref) {
  return spawnSync("git", ["rev-parse", "--verify", ref], {
    cwd,
    encoding: "utf8"
  }).status === 0;
}

function hasStagedChanges(cwd) {
  return spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    encoding: "utf8"
  }).status === 1;
}
