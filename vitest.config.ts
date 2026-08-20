import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["runtime/test/**/*.test.ts"]
  }
});
