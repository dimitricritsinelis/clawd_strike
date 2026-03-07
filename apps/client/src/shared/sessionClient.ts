/**
 * Client-side session token management for anti-cheat.
 * Requests a signed session token from the server when a game run starts.
 * The token is included in score submissions to prove the player loaded the game.
 * See docs/security.md for the full security architecture.
 */

const SESSION_ENDPOINT = "/api/session";

/**
 * Request a new session token from the server. Returns null on failure
 * (game still works — scores just won't be submitted).
 */
export async function requestSessionToken(): Promise<string | null> {
  try {
    const response = await fetch(SESSION_ENDPOINT, {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[session] token request failed: ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (typeof data?.token !== "string") {
      console.warn("[session] invalid token response");
      return null;
    }
    return data.token;
  } catch (error) {
    console.warn("[session] token request error", error);
    return null;
  }
}
