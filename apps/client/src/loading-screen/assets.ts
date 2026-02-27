const MOBILE_BREAKPOINT = "(max-width: 820px)";
const PRELOAD_TIMEOUT_MS = 2500;

type DeviceVariant = "mobile" | "desktop";

function getDeviceVariant(): DeviceVariant {
  return window.matchMedia(MOBILE_BREAKPOINT).matches ? "mobile" : "desktop";
}

function getCriticalAssetUrls(variant: DeviceVariant): string[] {
  if (variant === "mobile") {
    return [
      "/loading-screen/assets/loading-bg-mobile.webp",
      "/loading-screen/assets/loading-logo-mobile.webp",
      "/loading-screen/assets/info_screen.png",
      "/loading-screen/assets/loading-button-human-mobile.webp",
      "/loading-screen/assets/loading-button-agent-mobile.webp",
      "/loading-screen/assets/loading-button-skill-md-mobile.webp",
      "/loading-screen/assets/loading-button-enter-agent-mode-mobile.webp",
      "/loading-screen/assets/loading-mute-mobile.webp",
      "/loading-screen/assets/loading-info-mobile.webp",
    ];
  }

  return [
    "/loading-screen/assets/loading-bg-desktop.webp",
    "/loading-screen/assets/loading-logo-desktop.webp",
    "/loading-screen/assets/info_screen.png",
    "/loading-screen/assets/loading-button-human-desktop.webp",
    "/loading-screen/assets/loading-button-agent-desktop.webp",
    "/loading-screen/assets/loading-button-skill-md-desktop.webp",
    "/loading-screen/assets/loading-button-enter-agent-mode-desktop.webp",
    "/loading-screen/assets/loading-mute-desktop.webp",
    "/loading-screen/assets/loading-info-desktop.webp",
  ];
}

function waitForImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";

    let done = false;

    const finish = (success: boolean) => {
      if (done) return;
      done = true;

      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);

      if (!success) {
        console.warn(`[loading-screen] failed to preload asset: ${url}`);
      }

      resolve();
    };

    const onLoad = () => finish(true);
    const onError = () => finish(false);

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });

    image.src = url;

    if (typeof image.decode === "function") {
      void image.decode().then(
        () => finish(true),
        () => {
          // Decode can reject for transient reasons while load still succeeds.
        },
      );
    }
  });
}

export async function preloadCriticalLoadingAssets(): Promise<void> {
  const variant = getDeviceVariant();
  const urls = getCriticalAssetUrls(variant);

  const preloadPromise = Promise.all(urls.map((url) => waitForImage(url))).then(() => undefined);

  let timeoutId = 0;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve("timeout");
    }, PRELOAD_TIMEOUT_MS);
  });

  const preloadOutcome = preloadPromise.then(() => "preload" as const);
  const winner = await Promise.race([preloadOutcome, timeoutPromise]);

  if (winner === "preload") {
    window.clearTimeout(timeoutId);
    return;
  }

  console.warn(`[loading-screen] asset preload timed out after ${PRELOAD_TIMEOUT_MS}ms`);
}
