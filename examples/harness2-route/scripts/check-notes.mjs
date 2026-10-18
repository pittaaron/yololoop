import { readdir, readFile } from "node:fs/promises";

const slug = process.env.YOLOLOOP_ITEM_SLUG;
const files = await readdir("notes").catch(() => []);

if (!files.includes(`${slug}.md`)) {
  console.error(`notes/${slug}.md is missing`);
  process.exit(1);
}

for (const file of files) {
  const text = await readFile(`notes/${file}`, "utf8");
  if (!text.endsWith("\n")) {
    console.error(`notes/${file} does not end with a newline`);
    process.exit(1);
  }
}

console.log(`${files.length} note(s) end with a newline`);
