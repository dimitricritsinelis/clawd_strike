# Audit Ledger (Debloat)

## Rules
- Spark xhigh: FIND / READ / SUMMARIZE ONLY. No analysis, no “safe to delete”.
- All findings are assumed FALSE until validated by the main agent.
- Every finding includes evidence + citations:
  - file content citation: path:Lx-Ly
  - command citation: exact command + small output snippet

---

## Findings (Unvalidated)

### F-0001 — <Duplicate | Large | CandidateUnused | Redundant>
- Paths:
- What Spark observed:
- Evidence (snippet / command output):
- Citations:

### F-0002 — LargeDirectoriesTop25
- Paths:
- `./artifacts` (394M)
- `./artifacts/screenshots` (377M)
- `./art-source/loading-screen` (64M)
- `./art-source` (64M)
- `./apps/client` (57M)
- `./apps` (57M)
- `./output` (49M)
- `./art-source/loading-screen/ClawdStriker_Audio.mp3` (41M)
- `./output/web-game` (40M)
- `./apps/client/dist` (24M)
- `./apps/client/public` (23M)
- `./apps/client/public/loading-screen/assets` (15M)
- `./apps/client/public/loading-screen` (15M)
- `./apps/client/dist/loading-screen/assets` (15M)
- `./apps/client/dist/loading-screen` (15M)
- `./artifacts/screenshots/P10_loading_sync_fix` (14M)
- `./artifacts/tmp` (13M)
- `./artifacts/screenshots/P34_map_visual_polish` (10M)
- `./artifacts/screenshots/P31_bazaar_props` (9.2M)
- `./artifacts/screenshots/P32_prop_scale_stability` (9.1M)
- `./apps/client/dist/assets` (8.8M)
- `./apps/client/public/assets` (8.0M)
- `./docs/map-design` (7.5M)
- `./docs` (7.5M)
- What Spark observed:
- A repo-size listing was captured; these are the largest directories/files, with `artifacts` and `art-source/loading-screen` dominating.
- Evidence (snippet / command output):
- `du -a -h . | sort -hr | grep -vE '(^|/)\\.git(/|$)|(^|/)node_modules(/|$)' | head -n 25`
- Output sample:
  - `1.6G	.`
  - `394M	./artifacts`
  - `377M	./artifacts/screenshots`
  - `64M	./art-source/loading-screen`
  - `64M	./art-source`
- Citations:
- command: `du -a -h . | sort -hr | grep -vE '(^|/)\\.git(/|$)|(^|/)node_modules(/|$)' | head -n 25`

### F-0003 — ExactDuplicateFiles_PublicVsDistCopyTree
- Paths:
- `apps/client/public/loading-screen/assets/loading-logo-desktop.webp`
- `apps/client/dist/loading-screen/assets/loading-logo-desktop.webp`
- `apps/client/public/loading-screen/assets/loading-nameplate-callsign.png`
- `apps/client/dist/loading-screen/assets/loading-nameplate-callsign.png`
- `apps/client/public/assets/models/weapons/ak47/ak47.glb`
- `apps/client/dist/assets/models/weapons/ak47/ak47.glb`
- `apps/client/public/maps/bazaar-map/map_spec.json`
- `apps/client/dist/maps/bazaar-map/map_spec.json`
- What Spark observed:
- Identical byte-level duplicates are present between public and dist mirrors for loading assets, models, and map payload files.
- Evidence (snippet / command output):
- `find apps/client/public apps/client/dist -type f \( -name '*.png' -o -name '*.webp' -o -name '*.avif' -o -name '*.jpg' -o -name '*.json' -o -name '*.glb' -o -name '*.mp3' \) -print0 | xargs -0 md5 -r | sort | awk ...`
- Output sample:
  - `...`
  - `apps/client/public/loading-screen/assets/loading-logo-desktop.webp`
  - `apps/client/dist/loading-screen/assets/loading-logo-desktop.webp`
  - `...`
  - `apps/client/public/maps/bazaar-map/map_spec.json`
  - `apps/client/dist/maps/bazaar-map/map_spec.json`
- Citations:
- command: `find apps/client/public apps/client/dist -type f ...`

### F-0004 — ExactDuplicateFiles_AgentHandoffMapRefs
- Paths:
- `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- `artifacts/agent-handoff/P44_prop_agent_handoff/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- `artifacts/agent-handoff/P45_map_layout_handoff/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- `docs/map-design/refs/bazaar_slice_v2_2_map_only.png`
- `artifacts/agent-handoff/P44_prop_agent_handoff/refs/bazaar_slice_v2_2_map_only.png`
- `artifacts/agent-handoff/P45_map_layout_handoff/refs/bazaar_slice_v2_2_map_only.png`
- `docs/map-design/blockout/topdown_layout.svg`
- `artifacts/agent-handoff/P44_prop_agent_handoff/refs/topdown_layout.svg`
- `artifacts/agent-handoff/P45_map_layout_handoff/refs/topdown_layout.svg`
- What Spark observed:
- Runtime/design reference files are byte-duplicated into two handoff directories.
- Evidence (snippet / command output):
- `for f in docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png docs/map-design/refs/bazaar_slice_v2_2_map_only.png docs/map-design/blockout/topdown_layout.svg; do ...`
- Output sample:
  - each source path plus two `artifacts/agent-handoff/*/refs/*` duplicates
- Citations:
- command: `for f in docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png ...`

### F-0005 — ExactDuplicateFiles_RunCaptureTemplates
- Paths:
- `artifacts/screenshots/P11_weapon_csval_fix_extras/state-0.json`
- `artifacts/screenshots/P11_weapon_csval_fix_smoke/state-0.json`
- `artifacts/screenshots/P11_weapon_csval_fix_smoke_runtime/state-0.json`
- `artifacts/screenshots/P11_weapon_csval_fix_smoke_runtime2/errors-0.json`
- `artifacts/screenshots/P11_weapon_csval_fix_smoke/shot-0.png`
- What Spark observed:
- Repeated screenshot state capture files are reused across multiple prompt folders and output subfolders.
- Evidence (snippet / command output):
- `find artifacts output -type f \( -name 'state-0.json' -o -name 'shot-0.png' -o -name 'errors-0.json' \) -print0 | xargs -0 md5 -r | awk ...`
- Output sample:
  - `60::01fb101bb3086199516e4dd9428cb934` with many `artifacts/screenshots/.../state-0.json` files
- Citations:
- command: `find artifacts output -type f ...`

### F-0006 — CandidateUnused_DerivedOutputs_NoSourceRefs
- Paths:
- `art-source/`
- `artifacts/tmp/`
- `output/`
- `apps/client/dist/`
- What Spark observed:
- These directories have no direct repo-wide source references when searched as path terms with content roots excluded.
- Evidence (snippet / command output):
- `for t in 'art-source/' 'artifacts/tmp/' 'output/' 'apps/client/dist/' ...; do ...; echo 'NO_MATCH'; done`
- Output sample:
  - `## art-source/` + `NO_MATCH`
  - `## artifacts/tmp/` + `NO_MATCH`
  - `## output/` + `NO_MATCH`
  - `## apps/client/dist/` + `NO_MATCH`
- Citations:
- command: `for t in 'art-source/' 'artifacts/tmp/' 'output/' 'apps/client/dist/' ...`

### F-0007 — CandidateUnused_ArtSourceImageSet_NoRefs
- Paths:
- `art-source/loading-screen/ClawdStriker_Audio.mp3`
- `art-source/loading-screen/ClawdStriker_Logo.png`
- `art-source/loading-screen/button-human.png`
- `art-source/loading-screen/button-agent.png`
- `art-source/loading-screen/button-skill-md.png`
- `art-source/loading-screen/button-enter-agent-mode.png`
- `art-source/loading-screen/Loading_Screen_Background_4K.png`
- `art-source/loading-screen/mute-toggle.png`
- `art-source/loading-screen/info-button.png`
- What Spark observed:
- Searched filenames had no external matches outside the `art-source` tree.
- Evidence (snippet / command output):
- `for t in 'ClawdStriker_Audio.mp3' ... 'info-button.png'; do ...; echo 'NO_MATCH'; done`
- Output sample:
  - each filename above followed by `NO_MATCH`
- Citations:
- command: `for t in 'ClawdStriker_Audio.mp3' ... 'info-button.png'; do ...`

### F-0008 — CopyPatternScan_NoObviousMatches
- Paths:
- `None` by strict copy-pattern regex (`copy`, `old`, `backup`, `(1)`)
- What Spark observed:
- No strict tokenized copy-pattern filenames were found.
- Evidence (snippet / command output):
- `result=$(rg --files | rg -ni '(^|/)(.*(\\bcopy\\b|\\bold\\b|\\bbackup\\b|\\(1\\)).*)' | head -n 100); ...`
- Output: `NO_MATCH`
- Citations:
- command: `result=$(rg --files | rg -ni '(^|/)(.*(\\bcopy\\b|\\bold\\b|\\bbackup\\b|\\(1\\)).*)' | head -n 100); ...`

### F-0009 — RegistryManifestTouchpoints
- Paths:
- `apps/client/src/runtime/map/loadMap.ts`
- `apps/client/src/runtime/map/types.ts`
- `apps/client/public/maps/bazaar-map/map_spec.json`
- `apps/client/public/maps/bazaar-map/shots.json`
- What Spark observed:
- Registry-like map runtime references were encountered while collecting scan evidence.
- Evidence (snippet / command output):
- `rg -n "mapSpecUrl|shotsUrl|parseBlockoutSpec|parseAnchorsSpec|parseShotsSpec" apps/client/src/runtime/map/loadMap.ts apps/client/src/runtime/map/types.ts`
- Output sample:
  - `apps/client/src/runtime/map/loadMap.ts:42:  const mapSpecUrl = \`/maps/\${mapId}/map_spec.json\`;`
  - `apps/client/src/runtime/map/loadMap.ts:43:  const shotsUrl = \`/maps/\${mapId}/shots.json\`;`
  - `apps/client/src/runtime/map/loadMap.ts:52:      blockout: parseBlockoutSpec(mapSpecJson, mapSpecUrl),`
  - `apps/client/src/runtime/map/types.ts:216:export function parseBlockoutSpec(value: unknown, source = "map_spec.json"): RuntimeBlockoutSpec;`
  - `apps/client/src/runtime/map/types.ts:305:export function parseShotsSpec(value: unknown, source = "shots.json"): RuntimeShotsSpec;`
- Citations:
- command: `rg -n "mapSpecUrl|shotsUrl|parseBlockoutSpec|parseAnchorsSpec|parseShotsSpec" ...`

---

## Validation (Main Agent)

### F-0001
- Verdict: NEEDS_MORE_DATA
- How it was validated (steps + commands):
- Reviewed this finding entry directly; it has no paths/evidence to validate:
  - `sed -n '189,240p' AUDIT_LEDGER.md`
- Result:
- This item is a placeholder and cannot be validated without an actual path list or artifact id.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0002
- Verdict: NEEDS_MORE_DATA
- How it was validated (steps + commands):
- Confirmed this is a size inventory (not a single deletable target):
  - `du -sh artifacts artifacts/screenshots art-source art-source/loading-screen output apps/client/dist apps/client/public`
- Confirmed the list mixes required and removable classes:
  - Required example: `apps/client/dist` is required by preview (`pnpm preview -- --port 4174` fails when `dist` is renamed).
  - Process-required example: `artifacts/screenshots` is mandated in `AGENTS.md:237-246`.
- Result:
- This finding needs to be split into concrete path-level findings (one verdict per path class), otherwise it is not actionable as a single entry.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0003
- Verdict: FALSE_POSITIVE
- How it was validated (steps + commands):
- Verified build/preview contract:
  - `nl -ba apps/client/package.json | sed -n '1,20p'` (shows `build`, `preview` scripts)
- Reversible test:
  - `mv apps/client/dist apps/client/dist.__auditbak`
  - `pnpm preview -- --port 4174`
  - Output: `Error: The directory "dist" does not exist. Did you build your project?`
  - Restored: `mv apps/client/dist.__auditbak apps/client/dist`
- Result:
- `public` vs `dist` duplicates are expected build artifacts, not dead files.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0004
- Verdict: CONFIRMED
- How it was validated (steps + commands):
- Reversible removal test (rename, validate, restore):
  - Renamed `artifacts/agent-handoff` to `artifacts/agent-handoff.__auditbak`
  - Ran `pnpm build` (pass; see `/tmp/audit_rename_build2.log`)
  - Smoke fetches stayed healthy:
    - `curl http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human` => `200`
    - `curl http://127.0.0.1:5174/maps/bazaar-map/map_spec.json` => `200`
  - Restored original directory name.
- Result:
- Removing the handoff reference duplicates does not affect build or runtime smoke.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0005
- Verdict: CONFIRMED
- How it was validated (steps + commands):
- Reversible removal test for listed P11 capture dirs:
  - `artifacts/screenshots/P11_weapon_csval_fix_extras`
  - `artifacts/screenshots/P11_weapon_csval_fix_smoke`
  - `artifacts/screenshots/P11_weapon_csval_fix_smoke_runtime`
  - `artifacts/screenshots/P11_weapon_csval_fix_smoke_runtime2`
- Validation run while renamed:
  - `pnpm build` => pass (`/tmp/audit_rename_build2.log`)
  - Smoke HTTP checks => `200` on app and map endpoints.
- Restored all renamed directories.
- Result:
- These duplicate run-capture artifacts are removable without affecting build/smoke.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0006
- Verdict: FALSE_POSITIVE
- How it was validated (steps + commands):
- Entry paths validated individually:
  - `apps/client/dist` is required by preview:
    - Rename + `pnpm preview -- --port 4174` => fails with missing `dist`.
  - `art-source`, `artifacts/tmp`, `output` were reversible-renamed together and validation still passed:
    - `pnpm build` => pass
    - Smoke HTTP checks => `200` for app and map endpoints.
- Result:
- As a grouped claim, this is false: at least one path (`apps/client/dist`) is actively required.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0007
- Verdict: CONFIRMED
- How it was validated (steps + commands):
- Usage tracing:
  - Runtime references `ClawdStriker_Audio_Loading_Trimmed.mp3`, not `ClawdStriker_Audio.mp3`:
    - `rg -n "ClawdStriker_Audio" apps/client/src/loading-screen/bootstrap.ts apps/client/src/loading-screen/audio.ts`
  - Original art-source filenames have no non-ledger references:
    - `rg -n "ClawdStriker_Audio\\.mp3|ClawdStriker_Logo\\.png|button-human\\.png|button-agent\\.png|button-skill-md\\.png|button-enter-agent-mode\\.png|Loading_Screen_Background_4K\\.png|mute-toggle\\.png|info-button\\.png" -S . --glob '!art-source/**'`
- Reversible removal test:
  - Renamed `art-source` during validation batch; `pnpm build` + smoke HTTP checks passed; restored.
- Result:
- The listed `art-source/loading-screen/*` files are removable with current runtime/build behavior.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0008
- Verdict: FALSE_POSITIVE
- How it was validated (steps + commands):
- Re-ran strict copy-pattern scan:
  - `result=$(rg --files | rg -ni '(^|/)(.*(\\bcopy\\b|\\bold\\b|\\bbackup\\b|\\(1\\)).*)' | head -n 100); [ -n "$result" ] && echo "$result" || echo NO_MATCH`
  - Output: `NO_MATCH`
- Result:
- No candidate paths exist for this finding; nothing to confirm/remove.
- Change made (commit / diff summary):
- None (validation-only update).

### F-0009
- Verdict: FALSE_POSITIVE
- How it was validated (steps + commands):
- Verified dynamic map registry/load paths:
  - `nl -ba apps/client/src/runtime/map/loadMap.ts | sed -n '20,60p'`
  - Shows runtime fetches:
    - `/maps/${mapId}/map_spec.json`
    - `/maps/${mapId}/shots.json`
- Verified map runtime generation pipeline:
  - `nl -ba apps/client/scripts/gen-map-runtime.mjs | sed -n '32,40p'`
  - Shows source-of-truth copy into `apps/client/public/maps/<mapId>/`.
- Reversible probe:
  - Temporarily renamed runtime map JSONs and launched Vite directly on `5176`; map URL returned HTML fallback (`<!doctype html>`) instead of JSON.
  - Given `fetchJson()` does `response.json()` in `loadMap.ts:33-38`, this would trigger `Invalid JSON` at runtime.
- Result:
- Registry/manifest touchpoints are real runtime dependencies, not unused paths.
- Change made (commit / diff summary):
- None (validation-only update).
