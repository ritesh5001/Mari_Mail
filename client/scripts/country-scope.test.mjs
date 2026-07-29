/**
 * Regression tests for the paid country-access boundary.
 *
 * `resolveCountryFilter` decides whether a workspace can see a country it
 * hasn't paid for. The previous implementation SUBSTITUTED the user's
 * `?destCountry` request for the plan's grant instead of intersecting them, so
 * `?destCountry=US` on a Brazil+India workspace returned US arrivals.
 *
 * The repo has no test runner, so this is a plain Node script:
 *     node client/scripts/country-scope.test.mjs
 *
 * It transpiles the source with the TypeScript compiler already present in
 * client/node_modules and imports the result, so it always tests the real file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ts = (await import(new URL("../node_modules/typescript/lib/typescript.js", import.meta.url).href)).default;

const src = readFileSync(new URL("../src/lib/country-scope.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const { resolveCountryFilter, requestedCountries, workspaceCountryScope } = mod;

const PRO = ["BR", "IN"];   // a 2-country plan
let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

console.log("resolveCountryFilter — the paid boundary");
t("no request -> full grant", () =>
  assert.deepEqual(resolveCountryFilter([], PRO), PRO));
t("in-plan request -> that country only", () =>
  assert.deepEqual(resolveCountryFilter(["IN"], PRO), ["IN"]));
t("BYPASS: out-of-plan request -> matches nothing (was: everything)", () =>
  assert.deepEqual(resolveCountryFilter(["US"], PRO), []));
t("mixed request -> only the granted part survives", () =>
  assert.deepEqual(resolveCountryFilter(["US", "BR", "CN"], PRO), ["BR"]));
t("legacy single-country grant is clamped too", () =>
  assert.deepEqual(resolveCountryFilter(["US"], "BR"), []));
t("legacy single grant, in-plan", () =>
  assert.deepEqual(resolveCountryFilter(["BR"], "BR"), ["BR"]));
t("unscoped workspace honours the request", () =>
  assert.deepEqual(resolveCountryFilter(["US"], null), ["US"]));
t("super-admin (null scope, no request) stays unrestricted", () =>
  assert.equal(resolveCountryFilter([], null), null));
t("empty grant array is treated as unrestricted, not as a lockout", () =>
  assert.deepEqual(resolveCountryFilter(["US"], []), ["US"]));

console.log("requestedCountries — input validation");
t("comma string", () => assert.deepEqual(requestedCountries({ destCountry: "br,in" }), ["BR", "IN"]));
t("repeated param", () => assert.deepEqual(requestedCountries({ destCountry: ["BR", "IN"] }), ["BR", "IN"]));
t("junk is dropped", () => assert.deepEqual(requestedCountries({ destCountry: "BRA,x,1,,US" }), ["US"]));
t("absent", () => assert.deepEqual(requestedCountries({}), []));

console.log("workspaceCountryScope — grant resolution");
t("allowlist wins over legacy", () =>
  assert.deepEqual(workspaceCountryScope({ allowedCountries: PRO, targetPortCountry: "BR" }), PRO));
t("falls back to legacy single", () =>
  assert.equal(workspaceCountryScope({ allowedCountries: [], targetPortCountry: "BR" }), "BR"));
t("null when neither is set", () =>
  assert.equal(workspaceCountryScope({ allowedCountries: [], targetPortCountry: null }), null));

console.log(`\n${n}/${n} passed`);
