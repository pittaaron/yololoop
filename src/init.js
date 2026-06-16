import { hasFile, writeText } from "./fs-utils.js";
import { templates } from "./templates.js";

export async function initProject(cwd, options = {}) {
  const created = [];
  const skipped = [];

  for (const [relativePath, content] of Object.entries(templates)) {
    if (hasFile(cwd, relativePath) && !options.force) {
      skipped.push(relativePath);
      continue;
    }

    await writeText(cwd, relativePath, content);
    created.push(relativePath);
  }

  return { created, skipped };
}
