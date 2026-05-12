const NAME_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "build",
  "can",
  "create",
  "creates",
  "for",
  "from",
  "generate",
  "generates",
  "it",
  "l1",
  "music",
  "that",
  "the",
  "takes",
  "take",
  "to",
  "tool",
  "using",
  "with",
]);

export function deriveGeneratedToolName(description: string) {
  const words = description
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !NAME_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 3);

  return words.length > 0 ? titleCase(words.join(" ")) : "Generated Tool";
}

export function slugifyToolName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "generated-tool";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}
