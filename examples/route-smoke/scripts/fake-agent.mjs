import { writeFile } from "node:fs/promises";

await writeFile("ROUTE_OUTPUT.md", [
  "# Route Output",
  "",
  `Title: ${process.env.YOLOLOOP_ITEM_TITLE}`,
  `Type: ${process.env.YOLOLOOP_ITEM_TYPE}`,
  `Slug: ${process.env.YOLOLOOP_ITEM_SLUG}`,
  `Branch: ${process.env.YOLOLOOP_BRANCH}`,
  ""
].join("\n"), "utf8");
