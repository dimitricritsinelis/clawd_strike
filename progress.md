Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-09

# progress.md — Clawd Strike Status

Original prompt: i want you to do a full audit of everything that is being stored in the postgress DB, what tables, what do they do, what data they collect, and then lets export all of the current data into a excel spreadsheet, on my desktop. each table can be a sheet in the excel file

## Active Change Tag
- `tooling`

## Current Status (<=10 lines)
- Added a read-only Postgres audit exporter at `scripts/export-postgres-audit.ts` backed by `scripts/lib/postgresAuditExport.ts`.
- The exporter discovers the live `public` schema from `information_schema`, uses the read-URL fallback chain, and avoids store paths that trigger schema maintenance.
- Workbook output includes `audit_summary` plus one sheet per live base table/view, with `shared_champion_daily_rollups_v1` exported as `daily_rollups_v1` to satisfy Excel sheet-name limits.
- `audit_summary` now captures relation purpose, collected fields, logical relationships, retention/cleanup notes, row counts, timestamp ranges, and live column schema text.
- JSON/JSONB columns are exported as compact JSON text so JSON `null` remains distinguishable from SQL `NULL`; non-JSON SQL nulls export as blank cells.
- Added `pnpm export:postgres-audit` and `pnpm test:postgres-audit`.
- Validation on 2026-03-09: `pnpm test:postgres-audit`, `pnpm export:postgres-audit -- --env-file .env.production.local --out /Users/dimitri/Desktop/clawd-strike-postgres-audit-2026-03-08.xlsx`, workbook reopen + sheet/count verification, `pnpm typecheck`, `pnpm build`.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm test:postgres-audit
pnpm export:postgres-audit -- --env-file .env.production.local --out /Users/dimitri/Desktop/clawd-strike-postgres-audit-2026-03-08.xlsx
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Title: Audit live Postgres storage and export the current data to Excel
- Changed: added a read-only Postgres audit/export CLI, workbook generation helper, focused export tests, and produced `/Users/dimitri/Desktop/clawd-strike-postgres-audit-2026-03-08.xlsx`.
- Files: `package.json`, `pnpm-lock.yaml`, `scripts/export-postgres-audit.ts`, `scripts/export-postgres-audit.test.ts`, `scripts/lib/postgresAuditExport.ts`
- Validation: see the Current Status validation line above.

## Next 3 Tasks
1. If this workbook format is useful, add a companion CSV/JSON export mode for downstream analysis without Excel.
2. Decide whether to add a second audit sheet for indexes/constraints if operators want more schema-level detail in the workbook itself.
3. If this becomes a recurring operator task, consider wrapping the export command in an automation or admin helper flow.

## Known Issues / Risks
- The exporter intentionally includes raw stored fingerprint hashes and audit payload JSON because the request was for a full storage audit; handle the workbook as sensitive internal data.
- Root `pnpm typecheck` still does not typecheck `scripts/**/*.ts`; the focused export test covers the new helper logic, but script-level TS compile enforcement remains a separate tooling follow-up.
