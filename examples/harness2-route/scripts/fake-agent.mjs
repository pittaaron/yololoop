import { mkdir, readFile, writeFile } from "node:fs/promises";

// Stands in for a coding agent: writes one note for the selected item and follows AGENTS.md.
const rules = await readFile("AGENTS.md", "utf8");
const endWithNewline = /end every file with a newline/i.test(rules);
const slug = process.env.YOLOLOOP_ITEM_SLUG;

await mkdir("notes", { recursive: true });
await writeFile(`notes/${slug}.md`, `# ${process.env.YOLOLOOP_ITEM_TITLE}${endWithNewline ? "\n" : ""}`, "utf8");
console.log(`wrote notes/${slug}.md`);
