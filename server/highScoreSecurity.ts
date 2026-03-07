import { createHash } from "node:crypto";

type RateLimitBucket = {
  count: number;
  windowStartedAtMs: number;
};

export type SharedChampionWriteRequestCheck =
  | {
      ok: true;
      clientIpHash: string;
      userAgent: string;
      origin: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
      clientIpHash: string;
      userAgent: string;
      origin: string | null;
    };

const rateLimitBuckets = new Map<string, RateLimitBucket>();

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

  return process.env.VERCEL_ENV !== "production";
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
  const clientIpHash = sha256Hex(extractClientIp(request));
  const userAgent = normalizeUserAgent(request);
  const origin = extractOrigin(request);

  if (!hasJsonContentType(request)) {
    return {
      ok: false,
      status: 415,
      error: "Expected application/json request body.",
      clientIpHash,
      userAgent,
      origin,
    };
  }

  if (options.requireSameOrigin) {
    if (!origin) {
      return {
        ok: false,
        status: 403,
        error: "Missing Origin header.",
        clientIpHash,
        userAgent,
        origin,
      };
    }

    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return {
        ok: false,
        status: 403,
        error: "Cross-origin write requests are not allowed.",
        clientIpHash,
        userAgent,
        origin,
      };
    }
  }

  const nowMs = Date.now();
  const rateLimitKey = `${options.rateLimitNamespace}:${clientIpHash}`;
  const allowed = consumeRateLimitBucket(rateLimitKey, nowMs, options.windowMs, options.maxRequests);
  if (!allowed) {
    return {
      ok: false,
      status: 429,
      error: "Too many shared champion write attempts. Try again later.",
      clientIpHash,
      userAgent,
      origin,
    };
  }

  return {
    ok: true,
    clientIpHash,
    userAgent,
    origin,
  };
}
