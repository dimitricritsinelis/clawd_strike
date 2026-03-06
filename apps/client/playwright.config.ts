import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PW_PORT ?? 4174);
const baseURL = process.env.PW_BASE_URL ?? `http://127.0.0.1:${port}`;
const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 150_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
      webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `pnpm gen:maps && pnpm exec vite --host --port ${port}`,
        url: baseURL,
        cwd: configDir,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
