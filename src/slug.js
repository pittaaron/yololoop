export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/`[^`]+`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "item";
}
