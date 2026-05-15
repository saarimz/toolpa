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

export type GeneratedToolIdentity = {
  baseName: string;
  id: string;
  name: string;
  slug: string;
  timestamp: string;
};

export type GeneratedToolIdentityOptions = {
  description: string;
  name?: string;
  now?: Date;
  randomSuffix?: string;
  slug?: string;
};

const GENERATED_TOOL_NAME_MAX_LENGTH = 80;
const GENERATED_TOOL_SLUG_MAX_LENGTH = 96;
const GENERATED_TOOL_RANDOM_SUFFIX_LENGTH = 8;

export function createGeneratedToolIdentity({
  description,
  name,
  now = new Date(),
  randomSuffix = createGeneratedToolRandomSuffix(),
  slug,
}: GeneratedToolIdentityOptions): GeneratedToolIdentity {
  const baseName = normalizeToolName(name || deriveGeneratedToolName(description));
  const timestamp = formatGeneratedToolTimestamp(now);
  const uniqueSuffix = normalizeGeneratedToolRandomSuffix(randomSuffix);
  const id = `${timestamp.toLowerCase()}-${uniqueSuffix}`;
  const nameId = `${timestamp}-${uniqueSuffix}`;
  const nameBase = truncateNameBase(
    baseName,
    GENERATED_TOOL_NAME_MAX_LENGTH - nameId.length - 1,
  );
  const slugBase = truncateSlugBase(
    slugifyToolName(slug || baseName),
    GENERATED_TOOL_SLUG_MAX_LENGTH - id.length - 1,
  );

  return {
    baseName,
    id,
    name: `${nameBase} ${nameId}`,
    slug: `${slugBase}-${id}`,
    timestamp,
  };
}

export function slugifyToolName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "generated-tool";
}

export function formatGeneratedToolTimestamp(value: Date) {
  const date = Number.isFinite(value.getTime()) ? value : new Date(0);
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    padMilliseconds(date.getUTCMilliseconds()),
    "Z",
  ].join("");
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function normalizeToolName(value: string) {
  return value.trim().replace(/\s+/g, " ") || "Generated Tool";
}

function normalizeGeneratedToolRandomSuffix(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, GENERATED_TOOL_RANDOM_SUFFIX_LENGTH);

  return normalized.padEnd(GENERATED_TOOL_RANDOM_SUFFIX_LENGTH, "0");
}

function createGeneratedToolRandomSuffix() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return normalizeGeneratedToolRandomSuffix(uuid);
  }

  const bytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function truncateNameBase(value: string, maxLength: number) {
  const normalized = normalizeToolName(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return (
    normalized
      .slice(0, Math.max(1, maxLength))
      .replace(/\s+\S*$/g, "")
      .trim() || normalized.slice(0, Math.max(1, maxLength)).trim()
  );
}

function truncateSlugBase(value: string, maxLength: number) {
  return (
    value
      .slice(0, Math.max(1, maxLength))
      .replace(/-+$/g, "") || "generated-tool"
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function padMilliseconds(value: number) {
  return String(value).padStart(3, "0");
}
