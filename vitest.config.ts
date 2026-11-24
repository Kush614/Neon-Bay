import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // Tests that boot a real server must never write into the repo's data/ folder.
    env: { NEON_BAY_DATA_DIR: join(tmpdir(), "neon-bay-test-data") },
  },
});
