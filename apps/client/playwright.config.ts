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
        env: {
          ...process.env,
          VERCEL_ENV: process.env.VERCEL_ENV ?? "production",
          SESSION_SECRET: process.env.SESSION_SECRET ?? "clawd-strike-playwright-session-secret-32chars",
          SHARED_CHAMPION_ADMIN_TOKEN: process.env.SHARED_CHAMPION_ADMIN_TOKEN
            ?? "clawd-strike-playwright-shared-champion-admin-token",
          STATS_ADMIN_TOKEN: process.env.STATS_ADMIN_TOKEN ?? "clawd-strike-dev-stats-admin-token",
          PRIVACY_HASH_SECRET: process.env.PRIVACY_HASH_SECRET ?? "clawd-strike-playwright-privacy-secret-32chars",
        },
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
