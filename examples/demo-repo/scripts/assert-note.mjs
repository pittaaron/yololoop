import { readFile } from "node:fs/promises";

const note = await readFile("NOTES.md", "utf8");

if (!note.includes(process.env.YOLOLOOP_ITEM_TITLE ?? "")) {
  console.error("NOTES.md does not include the selected backlog title");
  process.exit(1);
}
