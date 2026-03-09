import assert from "node:assert/strict";
import test from "node:test";

import {
  getSheetNameForRelation,
  serializeWorkbookCell,
} from "./lib/postgresAuditExport.js";

test("aliases long daily rollup relation names to a valid worksheet name", () => {
  assert.equal(getSheetNameForRelation("shared_champion_daily_rollups_v1"), "daily_rollups_v1");
  assert.equal(getSheetNameForRelation("shared_champion_name_rollups_v1"), "shared_champion_name_rollups_v1");
});

test("serializes workbook cells deterministically", () => {
  assert.equal(serializeWorkbookCell(null), "");
  assert.equal(serializeWorkbookCell("null"), "null");
  assert.equal(serializeWorkbookCell(new Date("2026-03-08T02:07:33.473Z")), "2026-03-08T02:07:33.473Z");
  assert.equal(serializeWorkbookCell({ updated: true, score: 573 }), "{\"updated\":true,\"score\":573}");
});
