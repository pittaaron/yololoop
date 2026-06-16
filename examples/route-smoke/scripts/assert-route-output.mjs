import { readFile } from "node:fs/promises";

const output = await readFile("ROUTE_OUTPUT.md", "utf8");

for (const expected of [
  "Title: chore: prove route environment variables",
  "Type: chore",
  "Slug: prove-route-environment-variables"
]) {
  if (!output.includes(expected)) {
    console.error(`missing ${expected}`);
    process.exit(1);
  }
}
