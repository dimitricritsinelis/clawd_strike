<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P09_highvis_palette_lighting.md -->

**Title:** Bright high-visibility blockout palette (default) + lighting tune

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Blockout + props:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildBlockout.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildProps.ts`
- Renderer:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/Renderer.ts`

**Goal (1 sentence):** Make the default gameplay view bright and high-visibility with a disciplined placeholder palette (floors/walls/landmarks/blockers) and strong ambient lighting (no dark/red-heavy blockout).

**Non-goals:**
- Do NOT add textures, decals, LUTs, or final lookdev pipelines.
- Do NOT add shadow-mapped lighting unless absolutely necessary.

**Implementation plan (file-specific, numbered):**
1) Dependencies: best after P04 and P07 so palette applies consistently.
2) Centralize a small high-vis material palette:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/BlockoutMaterials.ts`

   Palette rules (high-albedo):
   - floors: light gray stone-like
   - walls: warm sand/ochre (still bright)
   - landmarks: higher contrast (e.g., teal or deep blue accent) for arch/well markers
   - blockers/cover: distinct mid-tone (but not dark)
   - clear travel overlays: bright “do not block” highlight
3) Apply palette consistently:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildBlockout.ts`
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildProps.ts`
4) Lighting tune:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/Renderer.ts`

   Requirements:
   - Strong ambient/hemi light + one directional key light
   - No real-time shadows (MVP)
5) Optional `highvis=1` override:
   - When set, force maximum readability (even brighter colors) for fast layout validation.

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added) (no regress)
- ✅ entire map remains traversable (no regress)
- ✅ blockout colors/readability improved (very visible; easy to validate lanes/cuts)
- ✅ determinism preserved
- ✅ No dark/red-heavy default view; clear lane differentiation

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P09/before.png`
- `artifacts/screenshots/P09/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md`:
  - Note the final palette rules
  - Any readability concerns discovered
