/**
 * Free-form Apollo people search — filter validation and param mapping.
 *
 *   node server/scripts/apollo-people-search.test.mjs
 *
 * This endpoint is what makes cold campaigns usable: every cold campaign in
 * production sits at zero contacts because the only way to add anyone was
 * through a vessel's company domains. These tests pin the rules that keep the
 * search meaningful (and cheap) rather than the exact Apollo response shape.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// --- mirrors the `hasFilter` guard in routes/contacts.ts -------------------
const hasFilter = (f) =>
  (f.includeTitles?.length ?? 0) > 0 ||
  (f.seniorities?.length ?? 0) > 0 ||
  (f.personLocations?.length ?? 0) > 0 ||
  (f.companyLocations?.length ?? 0) > 0 ||
  (f.employeeRanges?.length ?? 0) > 0 ||
  Boolean(f.keywords);

console.log("filter guard — an unfiltered search is refused");
t("no filters at all -> refused", () => assert.equal(hasFilter({}), false));
t("empty arrays don't count as filters", () =>
  assert.equal(hasFilter({ includeTitles: [], seniorities: [], employeeRanges: [] }), false));
t("an empty keyword string doesn't count", () =>
  assert.equal(hasFilter({ keywords: "" }), false));
t("a title alone is enough", () =>
  assert.equal(hasFilter({ includeTitles: ["Founder"] }), true));
t("seniority alone is enough", () =>
  assert.equal(hasFilter({ seniorities: ["c_suite"] }), true));
t("headcount alone is enough", () =>
  assert.equal(hasFilter({ employeeRanges: ["1,20"] }), true));
t("keywords alone are enough", () =>
  assert.equal(hasFilter({ keywords: "SaaS" }), true));
t("EXCLUDE-only is NOT enough — it would still match the whole database", () =>
  assert.equal(hasFilter({ excludeTitles: ["Intern"] }), false));
t("email status alone is NOT enough, for the same reason", () =>
  assert.equal(hasFilter({ emailStatus: ["verified"] }), false));

console.log("headcount bands — Apollo's \"min,max\" format");
const rangeOk = (v) => /^\d+,\d+$/.test(v);
t("accepts Apollo's documented shape", () => {
  for (const v of ["1,10", "11,20", "250,500", "10000,50000"]) {
    assert.ok(rangeOk(v), `${v} should be valid`);
  }
});
t("rejects shapes Apollo would ignore silently", () => {
  for (const v of ["1-10", "1 , 10", "1,", ",10", "small", "1,10,20"]) {
    assert.ok(!rangeOk(v), `${v} should be rejected rather than sent and ignored`);
  }
});

console.log("param mapping — our names to Apollo's");
const toApollo = (f) => ({
  person_titles: f.includeTitles,
  person_not_titles: f.excludeTitles,
  person_seniorities: f.seniorities,
  person_locations: f.personLocations,
  organization_locations: f.companyLocations,
  organization_num_employees_ranges: f.employeeRanges,
  contact_email_status: f.emailStatus,
  include_similar_titles: f.includeSimilarTitles,
  q_keywords: f.keywords,
});
t("person vs company location do not get crossed", () => {
  const body = toApollo({ personLocations: ["London"], companyLocations: ["Singapore"] });
  assert.deepEqual(body.person_locations, ["London"]);
  assert.deepEqual(body.organization_locations, ["Singapore"]);
});
t("every filter lands on its documented Apollo parameter", () => {
  const body = toApollo({
    includeTitles: ["Founder"], excludeTitles: ["Intern"], seniorities: ["c_suite"],
    employeeRanges: ["1,20"], emailStatus: ["verified"], keywords: "SaaS", includeSimilarTitles: true,
  });
  assert.deepEqual(body.person_titles, ["Founder"]);
  assert.deepEqual(body.person_not_titles, ["Intern"]);
  assert.deepEqual(body.person_seniorities, ["c_suite"]);
  assert.deepEqual(body.organization_num_employees_ranges, ["1,20"]);
  assert.deepEqual(body.contact_email_status, ["verified"]);
  assert.equal(body.q_keywords, "SaaS");
  assert.equal(body.include_similar_titles, true);
});
t("industry/segment terms ride q_keywords — Apollo exposes no industry facet", () => {
  const body = toApollo({ keywords: "Computer Software, E-commerce" });
  assert.equal(body.q_keywords, "Computer Software, E-commerce");
  assert.equal("organization_industries" in body, false,
    "must not invent a parameter Apollo would ignore");
});

console.log(`\n${n}/${n} passed`);
