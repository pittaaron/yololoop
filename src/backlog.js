import { hasFile, readText, writeText } from "./fs-utils.js";
import { slugify } from "./slug.js";
import { UserError } from "./errors.js";

const BACKLOG_FILE = "BACKLOG.md";
const uncheckedPattern = /^(\s*[-*]\s+\[\s\]\s+)(.+?)\s*$/;
const checkedPattern = /^(\s*[-*]\s+\[[xX]\]\s+)(.+?)\s*$/;

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

// Finds a planned item in the backlog as it is now. The plan's line index can go stale when
// a branch checkout or the route itself edits BACKLOG.md, so the title is the identity.
export async function resolveItem(cwd, item) {
  const { markdown, items } = await readBacklog(cwd);
  const open = items.find((candidate) => candidate.lineIndex === item.lineIndex && candidate.title === item.title)
    ?? items.find((candidate) => candidate.title === item.title);

  if (open) {
    return { status: "open", item: open };
  }

  const done = markdown.split(/\r?\n/).some((line) => line.match(checkedPattern)?.[2] === item.title);
  return { status: done ? "done" : "missing" };
}

export async function markItemDone(cwd, item) {
  const markdown = await readText(cwd, BACKLOG_FILE);
  const lines = markdown.split(/\r?\n/);
  const lineIndex = locateItemLine(lines, item);
  const line = lines[lineIndex];

  if (!line) {
    throw new UserError(item.title === undefined
      ? `cannot mark item done; line ${item.lineIndex + 1} is missing`
      : `cannot mark item done; "${item.title}" is no longer in ${BACKLOG_FILE}`);
  }

  if (/\[[xX]\]/.test(line)) {
    return;
  }

  const nextLine = line.replace(/\[\s\]/, "[x]");
  if (nextLine === line) {
    throw new UserError(`cannot mark item done; line ${lineIndex + 1} is not unchecked`);
  }

  lines[lineIndex] = nextLine;
  await writeText(cwd, BACKLOG_FILE, lines.join("\n"));
}

function locateItemLine(lines, item) {
  if (item.title === undefined) {
    return item.lineIndex;
  }

  const titleAt = (index) => (lines[index]?.match(uncheckedPattern) ?? lines[index]?.match(checkedPattern))?.[2];
  if (titleAt(item.lineIndex) === item.title) {
    return item.lineIndex;
  }

  const unchecked = lines.findIndex((line) => line.match(uncheckedPattern)?.[2] === item.title);
  if (unchecked !== -1) {
    return unchecked;
  }

  return lines.findIndex((line) => line.match(checkedPattern)?.[2] === item.title);
}
