import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import {
  PromptMemoryEntrySchema,
  type PromptMemoryEntryInput,
  type PromptMemoryRecord,
} from "@/lib/prompt-memory/schema";

export const DEFAULT_PROMPT_MEMORY_DIR = ".memory/prompts";

type WritePromptMemoryOptions = {
  dir?: string;
  disabled?: boolean;
  id?: string;
  now?: Date;
};

export type PromptMemoryWriteResult = {
  filePath: string;
  record: PromptMemoryRecord;
};

export async function recordPromptMemory(
  input: PromptMemoryEntryInput,
): Promise<PromptMemoryWriteResult | null> {
  try {
    return await writePromptMemory(input);
  } catch (error) {
    console.warn("[prompt-memory] failed to write prompt log", error);
    return null;
  }
}

export async function writePromptMemory(
  input: PromptMemoryEntryInput,
  options: WritePromptMemoryOptions = {},
): Promise<PromptMemoryWriteResult | null> {
  if (options.disabled ?? process.env.TOOLPA_PROMPT_MEMORY_DISABLED === "1") {
    return null;
  }

  const parsed = PromptMemoryEntrySchema.parse(input);
  const timestamp = (options.now ?? new Date()).toISOString();
  const record: PromptMemoryRecord = {
    id: options.id ?? randomUUID(),
    timestamp,
    ...parsed,
  };
  const dir = resolvePromptMemoryDir(options.dir);
  const filePath = join(dir, `${timestamp.slice(0, 10)}.ndjson`);

  await mkdir(dir, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");

  return { filePath, record };
}

export function resolvePromptMemoryDir(dir = process.env.TOOLPA_PROMPT_MEMORY_DIR) {
  const candidate = dir?.trim() || DEFAULT_PROMPT_MEMORY_DIR;
  return isAbsolute(candidate) ? candidate : join(process.cwd(), candidate);
}
