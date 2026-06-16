import process from "node:process";
import { initProject } from "./init.js";
import { runDoctor } from "./doctor.js";
import { createPlan, writePlan } from "./plan.js";
import { runOnce } from "./run.js";
import { getStatus } from "./status.js";
import { UserError } from "./errors.js";

const helpText = `yololoop

Usage:
  yololoop init [--force] [--cwd <path>]
  yololoop doctor [--cwd <path>]
  yololoop plan [--json] [--no-branch] [--cwd <path>]
  yololoop run --once [--no-branch] [--cwd <path>]
  yololoop status [--json] [--cwd <path>]

Commands:
  init      Create starter loop files.
  doctor    Check local tools and required project files.
  plan      Preview the next loop step and write a plan artifact.
  run       Execute one configured loop step.
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
      return printRun(await runOnce(cwd, { branch: !flags.noBranch }));
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
    once: false
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
  console.log(`wrote ${run.path}`);
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
