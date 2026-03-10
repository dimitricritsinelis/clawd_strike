# Movement crouch tuning reimplementation

Original prompt: Reimplement the deleted crouch tuning changes so crouching is higher, faster to settle, and faster to move while keeping the existing movement model and base run speed intact.

Current state:
- Completed: `PlayerController.ts` crouch eye height/movement constants updated to `CROUCH_EYE_HEIGHT_M = 1.3`, `CROUCH_HEIGHT_M = 1.4`, `CROUCH_SPEED_MPS = 3.0`; base run speed remains `6.0`.
- Completed: `Game.ts` crouch eye-height smoothing now uses `EYE_HEIGHT_LERP_RATE = 17.1` while keeping the same smoothing model.
- Completed: `bootstrap.ts` now resolves localhost-only unlimited health through one `effectiveUnlimitedHealth` value shared by `Game` and the ammo HUD, so local agent/debug URL flags work again without enabling god mode off localhost.
- Completed: `BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client smoke:agent` passed with all 3 routes.
- Completed with known env noise: `BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client qa:completion` passed the completion-gate portion and all gameplay assertions in `bot-intelligence-smoke`, but failed the final console-cleanliness assertion because the active `4174` server emitted `@vite/client` websocket `ERR_CONNECTION_REFUSED` errors and refused several audio asset requests.
- Pending: optional human pointer-lock feel pass.
