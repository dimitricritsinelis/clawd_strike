import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, "..");
const ARTIFACT_ROOT = path.resolve(CLIENT_ROOT, "..", "..", "artifacts", "playwright", "loading-screen-perf");
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4174";

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function timestampDir() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function attachResourceMonitor(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.clearBrowserCache");

  const inFlight = new Map();
  const resources = new Map();

  session.on("Network.responseReceived", (event) => {
    const url = event.response.url;
    if (!url.includes("/loading-screen/assets/")) return;
    inFlight.set(event.requestId, {
      url,
      mimeType: event.response.mimeType,
    });
  });

  session.on("Network.loadingFinished", (event) => {
    const resource = inFlight.get(event.requestId);
    if (!resource) return;
    const key = resource.url;
    const current = resources.get(key) ?? {
      url: key,
      mimeType: resource.mimeType,
      encodedDataLength: 0,
      requests: 0,
    };
    current.encodedDataLength += event.encodedDataLength;
    current.requests += 1;
    resources.set(key, current);
    inFlight.delete(event.requestId);
  });

  return {
    session,
    resources,
  };
}

async function gotoReadyLoadingScreen(page) {
  await page.goto(`${BASE_URL}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#start[data-assets-ready=\"true\"]");
}

async function captureDesktopState(browser, outputDir) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const monitor = await attachResourceMonitor(page);

  await gotoReadyLoadingScreen(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "desktop-main.png") });

  await page.click("#single-player-btn");
  await page.waitForSelector("#start[data-name-entry-visible=\"true\"]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "desktop-human.png") });

  await gotoReadyLoadingScreen(page);
  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();
  await page.waitForSelector("#start[data-name-entry-visible=\"true\"]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "desktop-agent.png") });

  await gotoReadyLoadingScreen(page);
  await page.click("#info-btn");
  await page.locator(".info-screen-art-img").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, "desktop-info.png") });

  const resources = [...monitor.resources.values()].sort((a, b) => a.url.localeCompare(b.url));
  const totalEncodedBytes = resources.reduce((sum, entry) => sum + entry.encodedDataLength, 0);

  await monitor.session.detach();
  await context.close();
  return {
    resources,
    totalEncodedBytes,
  };
}

async function captureMobileState(browser, outputDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await gotoReadyLoadingScreen(page);
  await page.screenshot({ path: path.join(outputDir, "mobile-main.png") });

  await page.click("#single-player-btn");
  await page.waitForSelector("#start[data-name-entry-visible=\"true\"]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "mobile-human.png") });

  await gotoReadyLoadingScreen(page);
  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();
  await page.waitForSelector("#start[data-name-entry-visible=\"true\"]");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, "mobile-agent.png") });

  await gotoReadyLoadingScreen(page);
  await page.click("#info-btn");
  await page.locator(".info-screen-art-img").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, "mobile-info.png") });

  await context.close();
}

async function main() {
  const outputDir = path.join(ARTIFACT_ROOT, timestampDir());
  await ensureDir(outputDir);

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const desktop = await captureDesktopState(browser, outputDir);
    await captureMobileState(browser, outputDir);

    const summary = {
      baseUrl: BASE_URL,
      outputDir,
      desktop,
    };
    await writeFile(
      path.join(outputDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );

    console.log(`[loading-screen-perf] pass | encodedBytes=${desktop.totalEncodedBytes} | output=${outputDir}`);
  } finally {
    await browser.close();
  }
}

await main();
