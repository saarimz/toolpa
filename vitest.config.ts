import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["server-only"],
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/tools/**/lib/**/*.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: [
            "node_modules",
            ".next",
            "coverage",
            "**/*.audio.test.ts",
            "**/*.browser.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "audio",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: ["**/*.audio.test.ts", "**/*.browser.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});
