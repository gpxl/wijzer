import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // wijzer's own tests, plus OpenWiki's committed spec test run verbatim
    // against the vendored source — it proves the vendored copy is a faithful,
    // executable OpenWiki (the parity oracle for tests/parity-crossvalidate.ts).
    include: ["tests/**/*.test.ts", "vendor/openwiki/test/**/*.test.ts"],
    // Each test spins up a temp git repo and shells out to the scripts; give
    // them room and run serially-ish to avoid thrashing the disk on CI.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
