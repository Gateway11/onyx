import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/jsm-validation",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    screenshot: "on",
    video: "on",
    trace: "off",
  },
  webServer: {
    command: "bun run dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    timeout: 180_000,
    env: { INTERNAL_URL: "http://127.0.0.1:8080", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
