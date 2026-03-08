const MOBILE_BREAKPOINT = "(max-width: 820px)";
export const OVERLAY_PRELOAD_TIMEOUT_MS = 2500;

export type LoadingScreenAssetPhase = "background" | "overlay";

type DeviceVariant = "mobile" | "desktop";

function getDeviceVariant(): DeviceVariant {
  return window.matchMedia(MOBILE_BREAKPOINT).matches ? "mobile" : "desktop";
}

type PhaseUrls = Record<LoadingScreenAssetPhase, Record<DeviceVariant, string[]>>;

const PHASE_URLS: PhaseUrls = {
  background: {
    mobile: [
      "/loading-screen/assets/loading-bg-mobile.webp",
    ],
    desktop: [
      "/loading-screen/assets/loading-bg-desktop.webp",
    ],
  },
  overlay: {
    mobile: [
      "/loading-screen/assets/loading-logo-mobile.webp",
      "/loading-screen/assets/loading-button-human-mobile.webp",
      "/loading-screen/assets/loading-button-agent-mobile.webp",
      "/loading-screen/assets/loading-button-skill-md-mobile.webp",
      "/loading-screen/assets/loading-button-enter-agent-mode-mobile.webp",
      "/loading-screen/assets/loading-mute-mobile.webp",
      "/loading-screen/assets/loading-info-mobile.webp",
      "/loading-screen/assets/loading-world-champion-badge.png",
    ],
    desktop: [
      "/loading-screen/assets/loading-logo-desktop.webp",
      "/loading-screen/assets/loading-button-human-desktop.webp",
      "/loading-screen/assets/loading-button-agent-desktop.webp",
      "/loading-screen/assets/loading-button-skill-md-desktop.webp",
      "/loading-screen/assets/loading-button-enter-agent-mode-desktop.webp",
      "/loading-screen/assets/loading-mute-desktop.webp",
      "/loading-screen/assets/loading-info-desktop.webp",
      "/loading-screen/assets/loading-world-champion-badge.png",
    ],
  },
};

function getPhaseAssetUrls(phase: LoadingScreenAssetPhase, variant: DeviceVariant): string[] {
  return PHASE_URLS[phase][variant];
}

async function waitForImage(url: string): Promise<boolean> {
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

      resolve(success);
    };

    const settleDecodedImage = () => {
      if (typeof image.decode !== "function") {
        finish(image.naturalWidth > 0 && image.naturalHeight > 0);
        return;
      }

      void image.decode().then(
        () => finish(image.naturalWidth > 0 && image.naturalHeight > 0),
        () => finish(image.naturalWidth > 0 && image.naturalHeight > 0),
      );
    };

    const onLoad = () => {
      settleDecodedImage();
    };

    const onError = () => {
      finish(false);
    };

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });

    image.src = url;

    if (image.complete) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        settleDecodedImage();
        return;
      }

      finish(false);
    }
  });
}

export type LoadingScreenAssetPreloadResult = {
  failedUrls: string[];
};

export async function preloadLoadingScreenAssets(
  phase: LoadingScreenAssetPhase,
): Promise<LoadingScreenAssetPreloadResult> {
  const variant = getDeviceVariant();
  const urls = getPhaseAssetUrls(phase, variant);
  const outcomes = await Promise.all(urls.map((url) => waitForImage(url)));
  const failedUrls = urls.filter((_, index) => !outcomes[index]);
  return { failedUrls };
}
