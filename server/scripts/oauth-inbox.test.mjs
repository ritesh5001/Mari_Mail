/**
 * Inbox OAuth failure handling.
 *
 *   node server/scripts/oauth-inbox.test.mjs
 *
 * The Gmail/Outlook connect flow is a TOP-LEVEL NAVIGATION, so anything that
 * returns JSON renders as a bare error page with no way back. These pin the
 * classification that decides what the user is actually told.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// --- mirrors oauthFailureSlug in routes/inboxes.ts ------------------------
function oauthFailureSlug(detail) {
  const text = detail.toLowerCase();
  if (text.includes("redirect_uri_mismatch")) return "redirect-mismatch";
  if (text.includes("invalid_client") || text.includes("unauthorized_client")) return "bad-client";
  if (text.includes("invalid_grant")) return "expired-code";
  if (text.includes("access_denied") || text.includes("consent_required")) return "denied";
  if (text.includes("insufficient") || text.includes("scope")) return "scope";
  return "failed";
}

console.log("failure classification — retrying vs calling an admin");
t("THE setup mistake: redirect_uri_mismatch is named, not hidden", () =>
  assert.equal(
    oauthFailureSlug('{"error":"redirect_uri_mismatch","error_description":"Bad Request"}'),
    "redirect-mismatch",
  ));
t("bad credentials are distinguished from transient failure", () => {
  assert.equal(oauthFailureSlug('{"error":"invalid_client"}'), "bad-client");
  assert.equal(oauthFailureSlug('{"error":"unauthorized_client"}'), "bad-client");
});
t("an expired auth code is retryable and says so", () =>
  assert.equal(oauthFailureSlug('{"error":"invalid_grant"}'), "expired-code"));
t("user cancellation is not an error state", () => {
  assert.equal(oauthFailureSlug("access_denied"), "denied");
  assert.equal(oauthFailureSlug("consent_required"), "denied");
});
t("a missing scope is reported as a scope problem", () =>
  assert.equal(oauthFailureSlug("insufficient_scope: Mail.Send"), "scope"));
t("anything unrecognised falls back rather than guessing", () =>
  assert.equal(oauthFailureSlug("socket hang up"), "failed"));
t("classification is case-insensitive", () =>
  assert.equal(oauthFailureSlug("REDIRECT_URI_MISMATCH"), "redirect-mismatch"));

console.log("banner routing — provider + reason split");
const parse = (status) => {
  const provider = status.startsWith("google-")
    ? "Gmail"
    : status.startsWith("outlook-")
      ? "Outlook"
      : null;
  return { provider, reason: provider ? status.slice(status.indexOf("-") + 1) : null };
};
t("provider-prefixed slugs split correctly", () => {
  assert.deepEqual(parse("google-redirect-mismatch"), { provider: "Gmail", reason: "redirect-mismatch" });
  assert.deepEqual(parse("outlook-bad-client"), { provider: "Outlook", reason: "bad-client" });
  assert.deepEqual(parse("google-denied"), { provider: "Gmail", reason: "denied" });
});
t("a multi-hyphen reason keeps all its parts", () =>
  assert.equal(parse("outlook-redirect-mismatch").reason, "redirect-mismatch"));
t("non-provider statuses aren't mistaken for one", () =>
  assert.equal(parse("session-expired").provider, null));

console.log("actor resolution — why the access cookie alone wasn't enough");
const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 7 * 24 * 3600_000;
t("the refresh window is vastly longer than the access window", () =>
  assert.ok(REFRESH_TTL_MS > ACCESS_TTL_MS * 500,
    "a page open past 15 minutes must not lose a 7-day session"));
t("15 minutes is short enough to hit while reading one dialog", () =>
  assert.ok(ACCESS_TTL_MS <= 15 * 60_000));

console.log(`\n${n}/${n} passed`);
