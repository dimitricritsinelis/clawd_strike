# Movement crouch tuning reimplementation

Original prompt: Reimplement the deleted crouch tuning changes so crouching is higher, faster to settle, and faster to move while keeping the existing movement model and base run speed intact.

Current state:
- Completed: `PlayerController.ts` crouch eye height/movement constants updated to `CROUCH_EYE_HEIGHT_M = 1.3`, `CROUCH_HEIGHT_M = 1.4`, `CROUCH_SPEED_MPS = 3.0`; base run speed remains `6.0`.
- Completed: `Game.ts` crouch eye-height smoothing now uses `EYE_HEIGHT_LERP_RATE = 17.1` while keeping the same smoothing model.
- Pending: validation runs and optional human pointer-lock feel pass.
