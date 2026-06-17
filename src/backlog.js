import { hasFile, readText, writeText } from "./fs-utils.js";
import { slugify } from "./slug.js";
import { UserError } from "./errors.js";

const BACKLOG_FILE = "BACKLOG.md";
const uncheckedPattern = /^(\s*[-*]\s+\[\s\]\s+)(.+?)\s*$/;

export function classifyBacklogTitle(title) {
  const normalized = title.trim().toLowerCase();

  if (normalized.startsWith("proposal:") || normalized.startsWith("feature:")) {
    return "proposal";
  }

  if (normalized.startsWith("bug:") || normalized.startsWith("fix:")) {
    return "bug";
  }

  return "chore";
}

export function parseBacklog(markdown) {
  return markdown.split(/\r?\n/).flatMap((line, lineIndex) => {
    const match = line.match(uncheckedPattern);
    if (!match) {
      return [];
    }

    const title = match[2].trim();
    const type = classifyBacklogTitle(title);

    return [{
      id: `${lineIndex + 1}-${slugify(title)}`,
      lineIndex,
      title,
      type,
      slug: slugify(title.replace(/^(proposal|feature|bug|fix|chore):\s*/i, "")),
      raw: line
    }];
  });
}

export async function readBacklog(cwd) {
  if (!hasFile(cwd, BACKLOG_FILE)) {
    throw new UserError(`missing ${BACKLOG_FILE}; run yololoop init first`);
  }

  const markdown = await readText(cwd, BACKLOG_FILE);
  return {
    markdown,
    items: parseBacklog(markdown)
  };
}

export async function selectNextItem(cwd) {
  const backlog = await readBacklog(cwd);
  return backlog.items[0] ?? null;
}

export async function markItemDone(cwd, item) {
  const markdown = await readText(cwd, BACKLOG_FILE);
  const lines = markdown.split(/\r?\n/);
  const line = lines[item.lineIndex];

  if (!line) {
    throw new UserError(`cannot mark item done; line ${item.lineIndex + 1} is missing`);
  }

  if (/\[[xX]\]/.test(line)) {
    return;
  }

  const nextLine = line.replace(/\[\s\]/, "[x]");
  if (nextLine === line) {
    throw new UserError(`cannot mark item done; line ${item.lineIndex + 1} is not unchecked`);
  }

  lines[item.lineIndex] = nextLine;
  await writeText(cwd, BACKLOG_FILE, lines.join("\n"));
}
