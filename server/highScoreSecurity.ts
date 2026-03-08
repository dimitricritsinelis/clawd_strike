import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type RateLimitBucket = {
  count: number;
  windowStartedAtMs: number;
};

export type SharedChampionWriteRequestCheck =
  | {
      ok: true;
      clientIpFingerprint: string;
      userAgentFingerprint: string;
      origin: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      clientIpFingerprint: string;
      userAgentFingerprint: string;
      origin: string | null;
    };

export type SharedChampionAdminAuthCheck =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const DEV_FALLBACK_PRIVACY_HASH_SECRET = "clawd-strike-dev-privacy-hash-secret-32chars";
const DEV_FALLBACK_STATS_ADMIN_TOKEN = "clawd-strike-dev-stats-admin-token";

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return null;
}

export function isSharedChampionPublicRunSubmissionEnabled(): boolean {
  const override = parseBooleanEnv(process.env.SHARED_CHAMPION_ENABLE_PUBLIC_RUNS);
  if (override !== null) {
    return override;
  }

  return true;
}

export function getSharedChampionAdminToken(): string | null {
  const value = process.env.SHARED_CHAMPION_ADMIN_TOKEN?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function hasSharedChampionAdminToken(): boolean {
  return getSharedChampionAdminToken() !== null;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getPrivacyHashSecret(): string {
  const value = process.env.PRIVACY_HASH_SECRET?.trim() ?? "";
  if (value.length >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    console.warn(
      "[privacy-hash] WARNING: PRIVACY_HASH_SECRET is missing or too short. "
      + "Using dev fallback. Set a 32+ character PRIVACY_HASH_SECRET env var in Vercel.",
    );
  }
  return DEV_FALLBACK_PRIVACY_HASH_SECRET;
}

function fingerprintValue(namespace: string, value: string): string {
  return createHmac("sha256", getPrivacyHashSecret())
    .update(`${namespace}:${value}`)
    .digest("hex");
}

export function extractClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

function cleanupExpiredRateLimitBuckets(nowMs: number): void {
  for (const [key, bucket] of rateLimitBuckets) {
    if (nowMs - bucket.windowStartedAtMs > 10 * 60_000) {
      rateLimitBuckets.delete(key);
    }
  }
}

function consumeRateLimitBucket(
  key: string,
  nowMs: number,
  windowMs: number,
  maxRequests: number,
): boolean {
  cleanupExpiredRateLimitBuckets(nowMs);

  const bucket = rateLimitBuckets.get(key);
  if (!bucket || nowMs - bucket.windowStartedAtMs >= windowMs) {
    rateLimitBuckets.set(key, {
      count: 1,
      windowStartedAtMs: nowMs,
    });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count += 1;
  return true;
}

function normalizeUserAgent(request: Request): string {
  return (request.headers.get("user-agent")?.trim() ?? "").slice(0, 512);
}

export function fingerprintClientIp(request: Request): string {
  return fingerprintValue("client-ip", extractClientIp(request));
}

export function fingerprintUserAgent(request: Request): string {
  return fingerprintValue("user-agent", normalizeUserAgent(request));
}

function extractOrigin(request: Request): string | null {
  const origin = request.headers.get("origin")?.trim() ?? "";
  return origin.length > 0 ? origin : null;
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
  return contentType.startsWith("application/json");
}

export function protectJsonWriteRequest(
  request: Request,
  options: {
    rateLimitNamespace: string;
    maxRequests: number;
    windowMs: number;
    requireSameOrigin: boolean;
  },
): SharedChampionWriteRequestCheck {
  const clientIpFingerprint = fingerprintClientIp(request);
  const userAgentFingerprint = fingerprintUserAgent(request);
  const origin = extractOrigin(request);

  if (!hasJsonContentType(request)) {
    return {
      ok: false,
      status: 415,
      error: "Expected application/json request body.",
      clientIpFingerprint,
      userAgentFingerprint,
      origin,
    };
  }

  if (options.requireSameOrigin) {
    if (!origin) {
      return {
        ok: false,
        status: 403,
        error: "Missing Origin header.",
        clientIpFingerprint,
        userAgentFingerprint,
        origin,
      };
    }

    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return {
        ok: false,
        status: 403,
        error: "Cross-origin write requests are not allowed.",
        clientIpFingerprint,
        userAgentFingerprint,
        origin,
      };
    }
  }

  const nowMs = Date.now();
  const rateLimitKey = `${options.rateLimitNamespace}:${clientIpFingerprint}`;
  const allowed = consumeRateLimitBucket(rateLimitKey, nowMs, options.windowMs, options.maxRequests);
  if (!allowed) {
    return {
      ok: false,
      status: 429,
      error: "Too many shared champion write attempts. Try again later.",
      clientIpFingerprint,
      userAgentFingerprint,
      origin,
    };
  }

  return {
    ok: true,
    clientIpFingerprint,
    userAgentFingerprint,
    origin,
  };
}

export function getStatsAdminToken(): string {
  const value = process.env.STATS_ADMIN_TOKEN?.trim() ?? "";
  if (value.length > 0) {
    return value;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    console.warn(
      "[stats-admin] WARNING: STATS_ADMIN_TOKEN is missing. Using dev fallback. "
      + "Set STATS_ADMIN_TOKEN in Vercel before exposing admin stats routes.",
    );
  }
  return DEV_FALLBACK_STATS_ADMIN_TOKEN;
}

export function authorizeStatsAdminRequest(request: Request): SharedChampionAdminAuthCheck {
  const expectedToken = getStatsAdminToken();
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!header.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Missing Bearer token.",
    };
  }
  const providedToken = header.slice("Bearer ".length).trim();
  if (providedToken.length === 0) {
    return {
      ok: false,
      status: 401,
      error: "Missing Bearer token.",
    };
  }

  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const providedBuffer = Buffer.from(providedToken, "utf8");
  if (
    expectedBuffer.length !== providedBuffer.length
    || !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Invalid admin token.",
    };
  }

  return { ok: true };
}
