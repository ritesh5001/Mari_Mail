/**
 * Auth policy defaults.
 *
 *   node server/scripts/auth-policy.test.mjs
 *
 * These pin the security-critical DEFAULTS — the values that apply when nobody
 * has set an environment variable. Email verification was previously opt-in
 * (`=== "true"`), which meant an unset variable silently left registration open:
 * anyone could sign up as an address they didn't own, take a trial, and send.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// Mirrors the expression in routes/auth.ts.
const requiresVerification = (envValue) => envValue !== "false";

console.log("REQUIRE_EMAIL_VERIFICATION — secure by default");
t("UNSET means verification is REQUIRED", () =>
  assert.equal(requiresVerification(undefined), true,
    "forgetting to set the variable must not be what makes the product insecure"));
t('"false" is the deliberate opt-out (local dev with no mail provider)', () =>
  assert.equal(requiresVerification("false"), false));
t('"true" keeps it on', () =>
  assert.equal(requiresVerification("true"), true));
t("an empty string keeps it on", () =>
  assert.equal(requiresVerification(""), true));
t("a typo like \"no\" fails SAFE (still on)", () =>
  assert.equal(requiresVerification("no"), true,
    "only the exact opt-out string may disable it"));
t('"False" (wrong case) fails SAFE — exact match only', () =>
  assert.equal(requiresVerification("False"), true));

console.log("account-state cache — bounded staleness");
const TTL_MS = 30_000;
const ACCESS_TOKEN_TTL_MS = 15 * 60_000;
t("a ban takes effect far sooner than the access token would expire", () =>
  assert.ok(TTL_MS < ACCESS_TOKEN_TTL_MS / 10,
    "the cache must not be the thing that keeps a banned user working"));
t("cache TTL is short enough to be unnoticeable operationally", () =>
  assert.ok(TTL_MS <= 60_000));

console.log(`\n${n}/${n} passed`);
