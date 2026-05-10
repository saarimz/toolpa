import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

import { type Pattern, PatternSchema } from "@/lib/pattern/schema";

const PARAM_NAME = "p";

export function encodePatternToHash(pattern: Pattern): string {
  const parsed = PatternSchema.parse(pattern);
  const compressed = compressToEncodedURIComponent(JSON.stringify(parsed));
  return `${PARAM_NAME}=${compressed}`;
}

export function decodePatternFromHash(hash: string): Pattern | null {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalized);
  const encoded = params.get(PARAM_NAME);

  if (!encoded) {
    return null;
  }

  const json = decompressFromEncodedURIComponent(encoded);
  if (!json) {
    return null;
  }

  return PatternSchema.parse(JSON.parse(json));
}

export function patternToUrl(url: URL, pattern: Pattern): URL {
  const next = new URL(url.toString());
  next.hash = encodePatternToHash(pattern);
  return next;
}
