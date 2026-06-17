import process from "node:process";
import { initProject } from "./init.js";
import { runDoctor } from "./doctor.js";
import { createPlan, writePlan } from "./plan.js";
import { runOnce } from "./run.js";
import { runLoop } from "./loop.js";
import { getStatus } from "./status.js";
import { createPullRequest } from "./pr.js";
import { UserError } from "./errors.js";

const helpText = `yololoop

Usage:
  yololoop init [--force] [--cwd <path>]
  yololoop doctor [--cwd <path>]
  yololoop plan [--json] [--no-branch] [--cwd <path>]
  yololoop run --once [--commit] [--no-branch] [--cwd <path>]
  yololoop loop [--max <n>] [--commit] [--no-branch] [--cwd <path>]
  yololoop pr [--dry-run] [--draft] [--base <branch>] [--cwd <path>]
  yololoop status [--json] [--cwd <path>]

Commands:
  init      Create starter loop files.
  doctor    Check local tools and required project files.
  plan      Preview the next loop step and write a plan artifact.
  run       Execute one configured loop step.
  loop      Execute repeated loop steps until max, failure, or empty backlog.
  pr        Create a GitHub pull request from the latest passed run.
  status    Show queue and latest artifact status.
`;

export async function main(argv) {
  const { command, flags, cwd } = parseArgs(argv);

  if (!command || flags.help) {
    console.log(helpText.trimEnd());
    return;
  }

  switch (command) {
    case "init":
      return printInit(await initProject(cwd, { force: flags.force }));
    case "doctor":
      return printDoctor(runDoctor(cwd));
    case "plan":
      return printPlan(cwd, await createPlan(cwd, { branch: !flags.noBranch }), flags);
    case "run":
      if (!flags.once) {
        throw new UserError("run currently requires --once");
      }
      return printRun(await runOnce(cwd, { branch: !flags.noBranch, commit: flags.commit }));
    case "loop":
      return printLoop(await runLoop(cwd, {
        max: flags.max,
        branch: !flags.noBranch,
        commit: flags.commit
      }));
    case "pr":
      return printPullRequest(await createPullRequest(cwd, {
        dryRun: flags.dryRun,
        draft: flags.draft,
        base: flags.base
      }));
    case "status":
      return printStatus(await getStatus(cwd), flags);
    default:
      throw new UserError(`unknown command ${command}`);
  }
}

function parseArgs(argv) {
  const flags = {
    force: false,
    help: false,
    json: false,
    noBranch: false,
    once: false,
    dryRun: false,
    draft: false,
    commit: false,
    base: "main",
    max: 1
  };
  let cwd = process.cwd();
  let command = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--no-branch") {
      flags.noBranch = true;
    } else if (arg === "--once") {
      flags.once = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--draft") {
      flags.draft = true;
    } else if (arg === "--commit") {
      flags.commit = true;
    } else if (arg === "--base") {
      const value = argv[index + 1];
      if (!value) {
        throw new UserError("--base requires a branch name");
      }
      flags.base = value;
      index += 1;
    } else if (arg === "--max") {
      const value = Number.parseInt(argv[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new UserError("--max requires a positive integer");
      }
      flags.max = value;
      index += 1;
    } else if (arg === "--cwd") {
      const value = argv[index + 1];
      if (!value) {
        throw new UserError("--cwd requires a path");
      }
      cwd = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new UserError(`unknown flag ${arg}`);
    } else if (!command) {
      command = arg;
    } else {
      throw new UserError(`unexpected argument ${arg}`);
    }
  }

  return { command, flags, cwd };
}

function printInit(result) {
  for (const file of result.created) {
    console.log(`created ${file}`);
  }
  for (const file of result.skipped) {
    console.log(`skipped ${file}`);
  }
}

function printDoctor(result) {
  console.log(result.ok ? "doctor passed" : "doctor found issues");
  for (const tool of result.tools) {
    const required = tool.required ? "required" : "optional";
    console.log(`${tool.found ? "ok" : "missing"} ${tool.name} (${required})`);
  }
  for (const file of result.files) {
    console.log(`${file.found ? "ok" : "missing"} ${file.path}`);
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function printPlan(cwd, plan, flags) {
  const path = await writePlan(cwd, plan);
  if (flags.json) {
    console.log(JSON.stringify({ ...plan, path }, null, 2));
    return;
  }

  if (plan.status === "empty") {
    console.log(plan.message);
    console.log(`wrote ${path}`);
    return;
  }

  console.log(`${plan.status}: ${plan.item.title}`);
  console.log(`branch: ${plan.branch.enabled ? plan.branch.name : "<disabled>"}`);
  console.log(`route: ${plan.route.mode}`);
  for (const action of plan.actions) {
    console.log(`- ${action}`);
  }
  console.log(`wrote ${path}`);
}

function printRun(run) {
  console.log(`${run.status}: ${run.item?.title ?? "no backlog item"}`);
  if (run.commit?.committed) {
    console.log(`commit: ${run.commit.sha}`);
  }
  console.log(`wrote ${run.path}`);
}

function printLoop(result) {
  console.log(`${result.status}: completed ${result.completed}/${result.requested}`);
  for (const run of result.runs) {
    const commit = run.commit?.committed ? ` (${run.commit.sha.slice(0, 7)})` : "";
    console.log(`- ${run.status}: ${run.item?.title ?? "no backlog item"}${commit}`);
  }
}

function printPullRequest(result) {
  if (result.dryRun) {
    console.log(`dry-run: ${result.command.join(" ")}`);
    console.log(`title: ${result.title}`);
    console.log(`head: ${result.head}`);
    console.log(`base: ${result.base}`);
    return;
  }

  console.log("created pull request");
  console.log(result.url);
}

function printStatus(status, flags) {
  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.log(`unchecked items: ${status.uncheckedItems}`);
  console.log(`next item: ${status.nextItem?.title ?? "<none>"}`);
  console.log(`latest plan: ${status.latestPlan?.status ?? "<none>"}`);
  console.log(`latest run: ${status.latestRun?.status ?? "<none>"}`);
}
