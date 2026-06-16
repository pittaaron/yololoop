import { hasFile, readText, writeJson } from "./fs-utils.js";
import { UserError } from "./errors.js";

export const CONFIG_FILE = "yololoop.config.json";

export const defaultConfig = {
  version: 0,
  routes: {
    chore: {
      mode: "manual",
      message: "Configure routes.chore before running live loop work."
    },
    bug: {
      mode: "manual",
      message: "Configure routes.bug before running live loop work."
    },
    proposal: {
      mode: "manual",
      message: "Configure routes.proposal before running live loop work."
    }
  },
  gates: []
};

export async function readConfig(cwd) {
  if (!hasFile(cwd, CONFIG_FILE)) {
    return structuredClone(defaultConfig);
  }

  let config;
  try {
    config = JSON.parse(await readText(cwd, CONFIG_FILE));
  } catch (error) {
    throw new UserError(`invalid ${CONFIG_FILE}: ${error.message}`);
  }

  validateConfig(config);
  return config;
}

export async function writeDefaultConfig(cwd) {
  await writeJson(cwd, CONFIG_FILE, defaultConfig);
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new UserError(`${CONFIG_FILE} must be a JSON object`);
  }

  if (config.version !== 0) {
    throw new UserError(`${CONFIG_FILE} version must be 0`);
  }

  if (!config.routes || typeof config.routes !== "object" || Array.isArray(config.routes)) {
    throw new UserError(`${CONFIG_FILE} routes must be an object`);
  }

  for (const [name, route] of Object.entries(config.routes)) {
    validateRoute(name, route);
  }

  if (!Array.isArray(config.gates)) {
    throw new UserError(`${CONFIG_FILE} gates must be an array`);
  }

  for (const gate of config.gates) {
    validateCommandShape(`gate ${gate?.name ?? "<unnamed>"}`, gate);
  }
}

function validateRoute(name, route) {
  if (!route || typeof route !== "object") {
    throw new UserError(`route ${name} must be an object`);
  }

  if (route.mode === "manual") {
    if (route.message !== undefined && typeof route.message !== "string") {
      throw new UserError(`route ${name} message must be a string`);
    }
    return;
  }

  if (route.mode === "command") {
    validateCommandShape(`route ${name}`, route);
    return;
  }

  throw new UserError(`route ${name} mode must be "manual" or "command"`);
}

function validateCommandShape(label, value) {
  if (!value || typeof value !== "object") {
    throw new UserError(`${label} must be an object`);
  }

  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new UserError(`${label} command must be a non-empty string`);
  }

  if (value.args !== undefined && (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== "string"))) {
    throw new UserError(`${label} args must be an array of strings`);
  }
}
