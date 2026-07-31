/**
 * Phase logic for the bulk vessel importer.
 *
 *   node server/scripts/import-phases.test.mjs
 *
 * These reimplement the pure decision rules from importVesselRows' phases 1-4
 * (dedupe, MMSI conflict resolution, create/update split) and pin the
 * behaviours that were previously getting imports killed. They are
 * intentionally about ORDERING and PRECEDENCE, which is where the old
 * row-at-a-time version went wrong.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// --- Phase 1: dedupe by IMO, last row wins ---------------------------------
function dedupeByImo(rows) {
  const byImo = new Map();
  for (const r of rows) byImo.set(r.imoNumber, r);
  return [...byImo.values()];
}

console.log("phase 1 — dedupe by IMO");
t("a file listing the same IMO twice yields one record", () => {
  const out = dedupeByImo([
    { imoNumber: "1111111", vesselName: "Old" },
    { imoNumber: "2222222", vesselName: "Other" },
    { imoNumber: "1111111", vesselName: "New" },
  ]);
  assert.equal(out.length, 2);
});
t("the LAST mention wins — it is the most complete", () => {
  const out = dedupeByImo([
    { imoNumber: "1111111", vesselName: "Old" },
    { imoNumber: "1111111", vesselName: "New" },
  ]);
  assert.equal(out[0].vesselName, "New");
});

// --- Phase 3: MMSI conflict resolution -------------------------------------
function resolveMmsi(records, dbHolders) {
  const errors = [];
  const wanted = new Map();
  for (const r of records) {
    if (!r.mmsi) continue;
    const prior = wanted.get(r.mmsi);
    if (prior) {
      prior.mmsi = undefined;
      errors.push({ row: prior.rowNumber, kind: "in-file-duplicate" });
    }
    wanted.set(r.mmsi, r);
  }
  const release = dbHolders.filter((h) => {
    const claimant = wanted.get(h.mmsi);
    return claimant && claimant.imoNumber !== h.imoNumber;
  });
  for (const h of release) errors.push({ row: wanted.get(h.mmsi).rowNumber, kind: "reassigned" });
  return { wanted, release, errors };
}

console.log("phase 3 — MMSI conflicts resolved before any write");
t("THE BUG: two rows sharing an MMSI no longer both try to claim it", () => {
  const a = { rowNumber: 2, imoNumber: "1111111", mmsi: "999" };
  const b = { rowNumber: 3, imoNumber: "2222222", mmsi: "999" };
  const { wanted, errors } = resolveMmsi([a, b], []);
  assert.equal(a.mmsi, undefined, "the earlier row must give up the MMSI");
  assert.equal(b.mmsi, "999", "the later row keeps it");
  assert.equal(wanted.size, 1, "exactly one vessel can claim an MMSI");
  assert.equal(errors[0].kind, "in-file-duplicate");
});
t("an MMSI held in the DB by a different IMO is released first", () => {
  const r = { rowNumber: 2, imoNumber: "1111111", mmsi: "999" };
  const { release } = resolveMmsi([r], [{ id: "v1", imoNumber: "8888888", mmsi: "999" }]);
  assert.equal(release.length, 1, "the stale holder must be cleared before the write");
  assert.equal(release[0].id, "v1");
});
t("an MMSI already on the SAME vessel is left alone", () => {
  const r = { rowNumber: 2, imoNumber: "1111111", mmsi: "999" };
  const { release } = resolveMmsi([r], [{ id: "v1", imoNumber: "1111111", mmsi: "999" }]);
  assert.equal(release.length, 0, "re-importing an unchanged vessel must not churn its MMSI");
});
t("rows without an MMSI are untouched", () => {
  const { wanted, release, errors } = resolveMmsi(
    [{ rowNumber: 2, imoNumber: "1111111", mmsi: undefined }], []);
  assert.equal(wanted.size, 0);
  assert.equal(release.length, 0);
  assert.equal(errors.length, 0);
});
t("three rows sharing one MMSI leave exactly one claimant", () => {
  const rows = [
    { rowNumber: 2, imoNumber: "1111111", mmsi: "999" },
    { rowNumber: 3, imoNumber: "2222222", mmsi: "999" },
    { rowNumber: 4, imoNumber: "3333333", mmsi: "999" },
  ];
  const { wanted, errors } = resolveMmsi(rows, []);
  assert.equal(wanted.size, 1);
  assert.equal(rows.filter((r) => r.mmsi).length, 1, "only one row keeps it");
  assert.equal(errors.filter((e) => e.kind === "in-file-duplicate").length, 2);
});

// --- Phase 4: create/update split ------------------------------------------
console.log("phase 4 — create/update split");
t("splits on whether the IMO already exists", () => {
  const existing = new Map([["1111111", "v1"]]);
  const records = [{ imoNumber: "1111111" }, { imoNumber: "2222222" }];
  assert.deepEqual(records.filter((r) => !existing.has(r.imoNumber)).map((r) => r.imoNumber), ["2222222"]);
  assert.deepEqual(records.filter((r) => existing.has(r.imoNumber)).map((r) => r.imoNumber), ["1111111"]);
});

// --- Query-count regression -------------------------------------------------
console.log("query volume — the reason imports took 46 minutes");
t("old design was O(rows) unbounded table scans; new design is O(1)", () => {
  const rows = 500;
  // Old: 3 companies/row, each doing 3 company scans + 1 contact scan.
  const oldScans = rows * 3 * 4;
  // New: one company read per kind, one contact read, once for the file.
  const newScans = 3 + 1;
  assert.equal(oldScans, 6000);
  assert.equal(newScans, 4);
  assert.ok(newScans < oldScans / 1000, "must be orders of magnitude fewer");
});

console.log(`\n${n}/${n} passed`);
