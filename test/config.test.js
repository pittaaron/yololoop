import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config.js";
import { UserError } from "../src/errors.js";

test("validateConfig accepts command routes and gates", () => {
  assert.doesNotThrow(() => validateConfig({
    version: 0,
    routes: {
      chore: {
        mode: "command",
        command: "node",
        args: ["script.mjs"]
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

test("validateConfig rejects unknown versions", () => {
  assert.throws(() => validateConfig({
    version: 99,
    routes: {},
    gates: []
  }), UserError);
});
