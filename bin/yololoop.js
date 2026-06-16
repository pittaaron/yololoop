#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  if (error?.name === "UserError") {
    console.error(`yololoop: ${error.message}`);
    process.exitCode = error.exitCode ?? 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
