import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Each test spins up a temp git repo and shells out to the scripts; give
    // them room and run serially-ish to avoid thrashing the disk on CI.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
