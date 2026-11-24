import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 960, height: 540 },
    // Software WebGL so the smoke test runs on machines without a GPU.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: [
    {
      command: "pnpm --filter @neon-bay/server start",
      port: 2567,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @neon-bay/client dev",
      port: 5173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
