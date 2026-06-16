import { appendFile } from "node:fs/promises";

const title = process.env.YOLOLOOP_ITEM_TITLE ?? "untitled item";
const branch = process.env.YOLOLOOP_BRANCH ?? "no-branch";

await appendFile("NOTES.md", `# Demo Note\n\nHandled: ${title}\nBranch: ${branch}\n`, "utf8");
