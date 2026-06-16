import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { hasFile } from "./fs-utils.js";

const tools = [
  { name: "node", required: true },
  { name: "git", required: true },
  { name: "npm", required: false },
  { name: "gh", required: false },
  { name: "claude", required: false },
  { name: "codex", required: false },
  { name: "openspec", required: false },
  { name: "shellcheck", required: false }
];

export function runDoctor(cwd) {
  const toolResults = tools.map((tool) => ({
    ...tool,
    found: commandExists(tool.name)
  }));

  const fileResults = [
    "AGENTS.md",
    "PROJECT.md",
    "BACKLOG.md",
    "yololoop.config.json"
  ].map((relativePath) => ({
    path: relativePath,
    found: hasFile(cwd, relativePath)
  }));

  const ok = toolResults.every((tool) => !tool.required || tool.found)
    && fileResults.every((file) => file.found);

  return { ok, tools: toolResults, files: fileResults };
}

export function commandExists(commandName) {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.join(directory, `${commandName}${extension}`);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return true;
      }
    }
  }

  return false;
}
