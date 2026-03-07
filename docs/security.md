Audience: implementation-agent
Authority: reference
Read when: security, api, public-contract, deployment
Owns: security architecture, anti-cheat design, environment variable requirements
Last updated: 2026-03-07

# Security Architecture

Clawd Strike is deployed publicly on Vercel. This document covers every security measure, why it exists, and which files own it.

## Threat Model

- The app is a browser-based FPS game with a sitewide high-score leaderboard.
- The only server-side state is a single champion record in Neon Postgres.
- The public agent API (`window.agent_observe`, `agent_apply_action`, etc.) is intentionally exposed for AI agents per `apps/client/public/skills.md`.
- Primary threat: fake high-score submissions via direct API calls.
- Secondary threats: XSS, clickjacking, MIME sniffing, iframe embedding.

## Security Layers

### 1. Session Tokens (proof-of-visit)

**What it does**: Proves a score submission came from someone who loaded the game page.

**How it works**:
- Client calls `POST /api/session` when a game run starts. Server returns a signed HMAC-SHA256 token.
- Token payload: `{ sid: UUID, iat: timestamp }`. Format: `base64url(payload).base64url(signature)`.
- Client includes the token in the score submission body as `sessionToken`.
- Server verifies the HMAC signature and checks the token is within the 30-minute expiry window.
- Stateless design: no DB table for sessions. The HMAC signature is the proof.

**What it prevents**: Direct `curl` abuse. An attacker must at least load the game page to get a token.

**What it does NOT prevent**: A determined attacker loading the page, getting a token, then forging telemetry with matching math.

**Environment variable**: `SESSION_SECRET` (required in production, 32+ characters). Generate with `openssl rand -hex 32`. In dev, a hardcoded fallback is used.

**Files**:
- `server/sessionToken.ts` — token generation and verification
- `api/session.ts` — Vercel function endpoint
- `apps/client/src/shared/sessionClient.ts` — client-side fetch
- `server/highScoreApi.ts` — verification on POST (before telemetry check)

### 2. Telemetry Validation (score formula check)

**What it does**: Verifies that the submitted score matches the game's scoring formula.

**How it works**:
- POST body must include `telemetry: { kills, headshots, shotsFired, shotsHit, survivalTimeS }`.
- Server checks:
  - `scoreHalfPoints === kills * 20 + headshots * 5` (formula match)
  - `headshots <= kills`
  - `shotsHit >= kills` (when kills > 0)
  - `shotsFired >= shotsHit`
  - `survivalTimeS > 0`
  - `kills / survivalTimeS <= 5` (plausibility cap)

**Score formula**: `score_points = kills * 10 + headshots * 2.5`. Stored as half-points (multiplied by 2) to avoid floating point.

**Files**:
- `apps/shared/highScore.ts` — `parseTelemetry()`, `validateTelemetry()`
- `server/highScoreApi.ts` — calls validation after session token check
- `apps/client/src/runtime/bootstrap.ts` — sends telemetry with submission

### 3. Rate Limiting (per-IP cooldown)

**What it does**: Limits score submissions to 1 per 30 seconds per IP address.

**How it works**:
- `champion_submissions_log` Postgres table stores `(client_ip, submitted_at)`.
- Before accepting a POST, query for recent submissions from the same IP.
- If any exist within 30 seconds, return `429 Too Many Requests`.
- Old entries (>1 hour) are pruned on each successful submission (best-effort).

**IP extraction**: From `x-forwarded-for` header (Vercel sets this).

**Known limitation**: Attackers can use rotating proxies to bypass IP-based limits.

**Files**:
- `server/highScoreStore.ts` — `isRateLimited()`, `logSubmission()` methods
- `server/highScoreApi.ts` — checks rate limit before body parsing
- `sql/shared_champion.sql` — table + index DDL

### 4. Request Size Limit

**What it does**: Rejects POST bodies over 1 KB.

**Why**: The valid payload is ~300 bytes. Prevents abuse via oversized payloads.

**File**: `server/highScoreApi.ts` — checks `Content-Length` header.

### 5. Security Headers

**What they do**: Protect against XSS, clickjacking, MIME sniffing, and iframe embedding.

**Headers** (configured in `vercel.json`):
- `X-Frame-Options: DENY` — blocks iframe embedding
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` — restricts script/style/img sources to `'self'`, allows `'unsafe-inline'` for styles (Three.js needs it), `blob:` for images, `frame-ancestors 'none'`

**File**: `vercel.json`

### 6. SSL Certificate Validation

**What it does**: Ensures the Postgres connection validates the server's SSL certificate.

**Setting**: `rejectUnauthorized: true` for non-localhost connections. Neon Postgres uses valid certificates.

**File**: `server/highScoreStore.ts` — `resolveSslConfig()`

### 7. SQL Injection Prevention

**How**: All database queries use parameterized placeholders (`$1`, `$2`, etc.), never string concatenation.

**File**: `server/highScoreStore.ts`

### 8. Input Sanitization

- Player names: trimmed, clamped to 15 characters, fallback to "Operator"/"Agent".
- Scores: parsed as numbers, must be finite and non-negative, rounded to integers.
- Control mode: enum-validated ("human" or "agent" only).

**File**: `apps/shared/highScore.ts`

### 9. Debug Function Gating

**What it does**: `window.__debug_emit_combat_feedback` and `window.__debug_eliminate_all_bots` are only registered when `isInternalDebugSurface` is true.

**Gate condition**: `import.meta.env.DEV || INTERNAL_DEBUG_HOSTNAMES.has(window.location.hostname)` where `INTERNAL_DEBUG_HOSTNAMES` is `localhost`, `127.0.0.1`, `::1`.

**In production**: `import.meta.env.DEV` is false, and the hostname is `clawd-strike.vercel.app`, so debug functions are never registered.

**Public agent API** (`agent_observe`, `agent_apply_action`, `advanceTime`, `render_game_to_text`): intentionally exposed per `apps/client/public/skills.md`.

**File**: `apps/client/src/runtime/bootstrap.ts` — search for `isInternalDebugSurface`

### 10. Audit Logging

**Format**: `[champion-submit] ip=<ip> name=<name> score=<score> mode=<mode> result=<accepted|rejected|rate-limited|not-higher> reason=<...>`

**Where to find**: Vercel function logs (Dashboard > Project > Logs, or `vercel logs`).

**File**: `server/highScoreApi.ts`

## Known Limitations

1. **Telemetry can be forged**: An attacker who computes matching kills/headshots/shots/survival-time can pass validation. The session token raises the bar (they must load the page) but doesn't fully prevent it.
2. **IP rate limiting is bypassable**: Rotating proxies defeat per-IP limits.
3. **Map data is publicly served**: `apps/client/public/maps/bazaar-map/map_spec.json` contains full map coordinates, spawn positions, and zone data. This is an accepted trade-off — it's a competitive fairness issue, not a security vulnerability.
4. **Tokens are not one-time-use**: Stateless design means the same token can be used for multiple submissions within 30 minutes. The rate limiter mitigates rapid reuse.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_URL` | Yes (prod) | Neon Postgres connection string. Also accepts `DATABASE_URL` or `NEON_DATABASE_URL`. |
| `SESSION_SECRET` | Yes (prod) | HMAC signing secret for session tokens. 32+ random characters. Generate: `openssl rand -hex 32` |

## File Map

| Concern | Primary File | Supporting Files |
|---------|-------------|-----------------|
| Session tokens | `server/sessionToken.ts` | `api/session.ts`, `apps/client/src/shared/sessionClient.ts` |
| Telemetry validation | `apps/shared/highScore.ts` | `server/highScoreApi.ts` |
| Rate limiting | `server/highScoreStore.ts` | `sql/shared_champion.sql` |
| Security headers | `vercel.json` | — |
| SSL validation | `server/highScoreStore.ts` | — |
| Debug gating | `apps/client/src/runtime/bootstrap.ts` | — |
| Audit logging | `server/highScoreApi.ts` | — |
| Input sanitization | `apps/shared/highScore.ts` | — |
| API entry points | `api/high-score.ts`, `api/session.ts` | — |
| Dev middleware | `server/highScoreVitePlugin.ts` | — |
