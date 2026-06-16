import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function hasFile(cwd, relativePath) {
  return existsSync(path.join(cwd, relativePath));
}

export async function readText(cwd, relativePath) {
  return readFile(path.join(cwd, relativePath), "utf8");
}

export async function writeText(cwd, relativePath, text) {
  const absolutePath = path.join(cwd, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text, "utf8");
}

export async function writeJson(cwd, relativePath, value) {
  await writeText(cwd, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function ensureDir(cwd, relativePath) {
  await mkdir(path.join(cwd, relativePath), { recursive: true });
}
