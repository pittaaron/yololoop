import { hasFile, readText, writeJson } from "./fs-utils.js";
import { UserError } from "./errors.js";

export const CONFIG_FILE = "yololoop.config.json";

export const defaultConfig = {
  version: 0,
  models: {
    worker: "gpt-5.4-mini"
  },
  runtime: {
    defaultTimeoutSeconds: 900,
    sleepSeconds: 0,
    maxRuntimeSeconds: 0
  },
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

  if (config.models !== undefined) {
    if (!config.models || typeof config.models !== "object" || Array.isArray(config.models)) {
      throw new UserError(`${CONFIG_FILE} models must be an object`);
    }

    for (const [name, value] of Object.entries(config.models)) {
      if (typeof value !== "string" || value.length === 0) {
        throw new UserError(`model ${name} must be a non-empty string`);
      }
    }
  }

  if (config.runtime !== undefined) {
    validateRuntime(config.runtime);
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

  if (route.mode === "model") {
    if (route.runner !== undefined && !["codex", "claude"].includes(route.runner)) {
      throw new UserError(`route ${name} runner must be "codex" or "claude"`);
    }

    if (typeof route.model !== "string" || route.model.length === 0) {
      throw new UserError(`route ${name} model must be a non-empty string`);
    }

    if (route.prompt !== undefined && typeof route.prompt !== "string") {
      throw new UserError(`route ${name} prompt must be a string`);
    }

    validateOptionalArgs(`route ${name}`, route);
    validateOptionalTimeout(`route ${name}`, route.timeoutSeconds);
    return;
  }

  throw new UserError(`route ${name} mode must be "manual", "command", or "model"`);
}

function validateCommandShape(label, value) {
  if (!value || typeof value !== "object") {
    throw new UserError(`${label} must be an object`);
  }

  if (typeof value.command !== "string" || value.command.length === 0) {
    throw new UserError(`${label} command must be a non-empty string`);
  }

  validateOptionalArgs(label, value);
  validateOptionalTimeout(label, value.timeoutSeconds);
}

function validateOptionalArgs(label, value) {
  if (value.args !== undefined && (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== "string"))) {
    throw new UserError(`${label} args must be an array of strings`);
  }
}

function validateRuntime(runtime) {
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new UserError(`${CONFIG_FILE} runtime must be an object`);
  }

  validateOptionalTimeout("runtime", runtime.defaultTimeoutSeconds);
  validateOptionalTimeout("runtime", runtime.maxRuntimeSeconds, { allowZero: true });
  validateOptionalTimeout("runtime", runtime.sleepSeconds, { allowZero: true });
}

function validateOptionalTimeout(label, value, options = {}) {
  if (value === undefined) {
    return;
  }

  const allowZero = options.allowZero ?? false;
  const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    throw new UserError(`${label} timeout values must be ${allowZero ? "non-negative" : "positive"} integers`);
  }
}
