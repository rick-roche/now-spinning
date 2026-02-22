import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "coverage/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.test.tsx",
        "**/*.spec.tsx",
        "**/*.config.{js,ts}",
        "vitest.setup.ts",
        "vitest.d.ts",
      ],
    },
  },
});
