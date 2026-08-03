/**
 * Country access control.
 *
 *   node server/scripts/country-scope.test.mjs
 *
 * A plan grants access to specific countries. Port Radar and Vessels have
 * always clamped to that grant; the dashboard overview never did, and read the
 * global ETA table instead. Measured on live data: a workspace paying for
 * India saw 436 "ETAs this week" where 117 were its own — 319 rows from
 * countries it had not bought.
 *
 * Mirrors client/src/lib/country-scope.ts and countryClause in eta-data.ts.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

/** Mirrors workspaceCountryScope(). */
const scopeFor = (ws) =>
  ws.allowedCountries?.length ? ws.allowedCountries : (ws.targetPortCountry ?? null);

/** Mirrors countryClause(): the Prisma where-fragment for a scope. */
function countryClause(scope) {
  if (Array.isArray(scope)) return { port: { is: { country: { in: scope } } } };
  return scope ? { port: { is: { country: scope } } } : {};
}

/** Mirrors resolveCountryFilter(): requested ∩ granted. */
function resolveCountryFilter(requested, scope) {
  const allowed = Array.isArray(scope) ? (scope.length ? scope : null) : scope ? [scope] : null;
  if (!allowed) return requested.length > 0 ? requested : null;
  if (requested.length === 0) return allowed;
  return requested.filter((c) => allowed.includes(c));
}

/** Would a row for `country` be visible under this clause? */
const visible = (clause, country) => {
  const c = clause.port?.is?.country;
  if (c === undefined) return true;                 // unrestricted
  if (typeof c === "string") return c === country;
  return c.in.includes(country);
};

console.log("the dashboard leak");
t("a two-country plan sees only those two", () => {
  const clause = countryClause(scopeFor({ allowedCountries: ["IN", "BR"] }));
  assert.equal(visible(clause, "IN"), true);
  assert.equal(visible(clause, "BR"), true);
  assert.equal(visible(clause, "US"), false, "an unbought country must not appear");
  assert.equal(visible(clause, "SG"), false);
});
t("THE BUG: no clause at all showed every country", () => {
  assert.equal(visible({}, "US"), true, "which is what the overview was doing");
});
t("a legacy single-country plan still works", () => {
  const clause = countryClause(scopeFor({ targetPortCountry: "IN" }));
  assert.equal(visible(clause, "IN"), true);
  assert.equal(visible(clause, "BR"), false);
});
t("the allowlist wins over the legacy single country", () =>
  assert.deepEqual(scopeFor({ allowedCountries: ["BR"], targetPortCountry: "IN" }), ["BR"]));
t("an unrestricted workspace is unaffected", () =>
  assert.deepEqual(countryClause(scopeFor({ allowedCountries: [], targetPortCountry: null })), {}));

console.log("empty means nothing, never everything");
t("an empty grant matches no country rather than all of them", () => {
  // The dangerous case: [] must not collapse to "unrestricted".
  const clause = countryClause([]);
  assert.equal(visible(clause, "IN"), false);
  assert.equal(visible(clause, "US"), false);
});
t("asking only for countries you don't have returns nothing", () => {
  const effective = resolveCountryFilter(["US"], ["IN", "BR"]);
  assert.deepEqual(effective, [], "not null — null would mean unrestricted");
  assert.equal(visible(countryClause(effective), "US"), false);
});

console.log("requested ∩ granted");
t("a request inside the grant is honoured", () =>
  assert.deepEqual(resolveCountryFilter(["IN"], ["IN", "BR"]), ["IN"]));
t("a mixed request keeps only the granted part", () =>
  assert.deepEqual(resolveCountryFilter(["IN", "US"], ["IN", "BR"]), ["IN"]));
t("no request falls back to the whole grant", () =>
  assert.deepEqual(resolveCountryFilter([], ["IN", "BR"]), ["IN", "BR"]));
t("an unscoped workspace honours whatever it asks for", () =>
  assert.deepEqual(resolveCountryFilter(["US"], null), ["US"]));

console.log("cache keys must include the grant");
t("two plans must not share one cached overview", () => {
  const key = (workspaceId, days, countries) => JSON.stringify([workspaceId, days, countries]);
  assert.notEqual(key("w1", 30, ["IN"]), key("w1", 30, ["IN", "BR"]),
    "a widened plan must not read a stale narrower answer, or the reverse");
  assert.equal(key("w1", 30, ["IN"]), key("w1", 30, ["IN"]));
});

console.log(`\n${n}/${n} passed`);
