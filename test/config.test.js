import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config.js";
import { UserError } from "../src/errors.js";

test("validateConfig accepts command routes and gates", () => {
  assert.doesNotThrow(() => validateConfig({
    version: 0,
    runtime: {
      defaultTimeoutSeconds: 900,
      sleepSeconds: 0,
      maxRuntimeSeconds: 0
    },
    routes: {
      chore: {
        mode: "command",
        command: "node",
        args: ["script.mjs"],
        timeoutSeconds: 60
      }
    },
    gates: [
      {
        name: "test",
        command: "npm",
        args: ["test"]
      }
    ]
  }));
});

test("validateConfig accepts model routes", () => {
  assert.doesNotThrow(() => validateConfig({
    version: 0,
    models: {
      worker: "gpt-5.4-mini"
    },
    routes: {
      chore: {
        mode: "model",
        runner: "codex",
        model: "worker",
        args: ["--ephemeral"],
        prompt: "Work on {{title}}."
      }
    },
    gates: []
  }));
});

test("validateConfig rejects unknown versions", () => {
  assert.throws(() => validateConfig({
    version: 99,
    routes: {},
    gates: []
  }), UserError);
});
