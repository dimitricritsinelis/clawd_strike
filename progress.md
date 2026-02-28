# progress.md — MVP Blockout Branch
Original prompt: help me fix the loading screen. i have an image that load when i click the info button, however the textbox needs fixing. i want the text in the text box to have the same behavior and font and settings as the nameplate. this is a hidden text box and the text should show ontop of the image

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Working on `codex/loading-screen` in the loading UI loop.
- Info overlay textbox was moved up by the same amount again; lift is now `-90px`.
- Vertical position is now controlled by CSS reference variables: `--info-textbox-top-desktop`, `--info-textbox-top-mobile`, `--info-textbox-y-lift`.
- Current lift is `--info-textbox-y-lift: -90px` (negative values move text up).
- Screenshot/validation loop skipped for this prompt per direct user request.
- `gen:maps` still emits anchor clearance warnings during build.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P141_loading_screen_textbox_move_up_same_amount_no_screenshots`
- What changed:
  - Updated `/Users/dimitri/Desktop/clawd-strike/apps/client/src/styles.css`:
    - Set `--info-textbox-y-lift` from `-66px` to `-90px` per request to move up by the same amount again.
- Validation:
  - Skipped for this prompt per user request ("skip the screenshots for now, just move it").
- Quick test steps:
  - `pnpm dev` then open: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
  - Click Info button and verify text sits higher than `-30px` while remaining over the image.
  - Tune vertical offset by editing `--info-textbox-y-lift` in `apps/client/src/styles.css` (negative = up, positive = down).
  - Runtime sanity pass: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`
  - Screenshot outputs: skipped for this prompt per request.

## Next 3 Tasks
1. Confirm whether `--info-textbox-y-lift: -90px` is final or if another fine nudge is desired.
2. Run screenshot pair + validation loop once user wants the next checkpoint.
3. Re-run info open/close spam test (info button + Escape) with final position locked.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright (`WrongDocumentError`) and still needs manual browser confirmation.
