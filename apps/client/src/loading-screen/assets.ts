const MOBILE_BREAKPOINT = "(max-width: 820px)";
export const OVERLAY_PRELOAD_TIMEOUT_MS = 2500;

export type LoadingScreenAssetPhase = "background";
export type DeviceVariant = "mobile" | "desktop";
export type LoadingScreenImageAssetKey =
  | "background"
  | "muteIcon"
  | "infoIcon"
  | "logo"
  | "buttonHuman"
  | "buttonAgent"
  | "buttonSkillMd"
  | "buttonEnterAgentMode"
  | "nameplate"
  | "worldChampionBadge"
  | "infoScreen";

export type LoadingScreenAudioSource = {
  src: string;
  type: string;
};

type ImageFormat = "avif" | "webp" | "png";

type AssetCandidate = {
  format: ImageFormat;
  mime: string;
  url: string;
};

type ResponsiveAsset = Record<DeviceVariant, AssetCandidate[]>;

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  avif: "image/avif",
  webp: "image/webp",
  png: "image/png",
};

function buildCandidates(baseName: string, formats: readonly ImageFormat[]): AssetCandidate[] {
  return formats.map((format) => ({
    format,
    mime: MIME_BY_FORMAT[format],
    url: `/loading-screen/assets/${baseName}.${format}`,
  }));
}

export function getDeviceVariant(): DeviceVariant {
  return window.matchMedia(MOBILE_BREAKPOINT).matches ? "mobile" : "desktop";
}

const IMAGE_ASSETS: Record<LoadingScreenImageAssetKey, ResponsiveAsset> = {
  background: {
    mobile: buildCandidates("loading-bg-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-bg-desktop", ["avif", "webp", "png"]),
  },
  muteIcon: {
    mobile: buildCandidates("loading-mute-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-mute-desktop", ["avif", "webp", "png"]),
  },
  infoIcon: {
    mobile: buildCandidates("loading-info-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-info-desktop", ["avif", "webp", "png"]),
  },
  logo: {
    mobile: buildCandidates("loading-logo-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-logo-desktop", ["avif", "webp", "png"]),
  },
  buttonHuman: {
    mobile: buildCandidates("loading-button-human-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-button-human-desktop", ["avif", "webp", "png"]),
  },
  buttonAgent: {
    mobile: buildCandidates("loading-button-agent-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-button-agent-desktop", ["avif", "webp", "png"]),
  },
  buttonSkillMd: {
    mobile: buildCandidates("loading-button-skill-md-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-button-skill-md-desktop", ["avif", "webp", "png"]),
  },
  buttonEnterAgentMode: {
    mobile: buildCandidates("loading-button-enter-agent-mode-mobile", ["avif", "webp", "png"]),
    desktop: buildCandidates("loading-button-enter-agent-mode-desktop", ["avif", "webp", "png"]),
  },
  nameplate: {
    mobile: buildCandidates("loading-nameplate-callsign-mobile", ["webp", "png"]),
    desktop: buildCandidates("loading-nameplate-callsign-desktop", ["webp", "png"]),
  },
  worldChampionBadge: {
    mobile: buildCandidates("loading-world-champion-badge-mobile", ["webp", "png"]),
    desktop: buildCandidates("loading-world-champion-badge-desktop", ["webp", "png"]),
  },
  infoScreen: {
    mobile: buildCandidates("info-screen-mobile", ["webp", "png"]),
    desktop: buildCandidates("info-screen-desktop", ["webp", "png"]),
  },
};

const AMBIENT_AUDIO_SOURCES: LoadingScreenAudioSource[] = [
  {
    src: "/loading-screen/assets/loading-ambient.ogg",
    type: "audio/ogg; codecs=opus",
  },
  {
    src: "/loading-screen/assets/ClawdStriker_Audio_Loading_Trimmed.mp3",
    type: "audio/mpeg",
  },
];

let avifSupport: boolean | null = null;
let webpSupport: boolean | null = null;

function detectImageFormatSupport(mime: string): boolean {
  const canvas = document.createElement("canvas");
  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = 1;
    canvas.height = 1;
  }
  try {
    return canvas.toDataURL(mime).startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

function supportsFormat(format: ImageFormat): boolean {
  if (format === "png") return true;
  if (format === "avif") {
    avifSupport ??= detectImageFormatSupport(MIME_BY_FORMAT.avif);
    return avifSupport;
  }
  webpSupport ??= detectImageFormatSupport(MIME_BY_FORMAT.webp);
  return webpSupport;
}

export function getLoadingScreenAssetCandidates(
  key: LoadingScreenImageAssetKey,
  variant: DeviceVariant = getDeviceVariant(),
): AssetCandidate[] {
  return IMAGE_ASSETS[key][variant];
}

export function getLoadingScreenPreferredAssetCandidate(
  key: LoadingScreenImageAssetKey,
  variant: DeviceVariant = getDeviceVariant(),
): AssetCandidate {
  const candidates = getLoadingScreenAssetCandidates(key, variant);
  const lastCandidate = candidates[candidates.length - 1];
  if (!lastCandidate) {
    throw new Error(`Missing loading-screen asset candidates for '${key}' (${variant})`);
  }
  const preferred = candidates.find((candidate) => supportsFormat(candidate.format));
  return preferred ?? lastCandidate;
}

export function getLoadingScreenPreferredAssetUrl(
  key: LoadingScreenImageAssetKey,
  variant: DeviceVariant = getDeviceVariant(),
): string {
  return getLoadingScreenPreferredAssetCandidate(key, variant).url;
}

export function getLoadingScreenFallbackAssetUrl(
  key: LoadingScreenImageAssetKey,
  variant: DeviceVariant = getDeviceVariant(),
): string {
  const candidate = getLoadingScreenAssetCandidates(key, variant).find((entry) => entry.format === "png");
  return candidate?.url ?? getLoadingScreenPreferredAssetUrl(key, variant);
}

export function getLoadingScreenImageSetValue(
  key: LoadingScreenImageAssetKey,
  variant: DeviceVariant,
): string {
  const candidates = getLoadingScreenAssetCandidates(key, variant);
  return `image-set(${candidates
    .map((candidate) => `url("${candidate.url}") type("${candidate.mime}") 1x`)
    .join(", ")})`;
}

export function getLoadingScreenAmbientAudioSources(): LoadingScreenAudioSource[] {
  return AMBIENT_AUDIO_SOURCES;
}

export async function preloadLoadingScreenAsset(
  asset: string | { key: LoadingScreenImageAssetKey; variant?: DeviceVariant },
): Promise<boolean> {
  const url = typeof asset === "string"
    ? asset
    : getLoadingScreenPreferredAssetUrl(asset.key, asset.variant);

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
  if (phase !== "background") {
    return { failedUrls: [] };
  }
  const candidate = getLoadingScreenPreferredAssetCandidate("background");
  const success = await preloadLoadingScreenAsset(candidate.url);
  return {
    failedUrls: success ? [] : [candidate.url],
  };
}
