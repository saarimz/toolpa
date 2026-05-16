import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

if (typeof process !== "undefined") {
  process.env.TOOLPA_PROMPT_MEMORY_DISABLED = "1";
}

vi.mock("server-only", () => ({}));
