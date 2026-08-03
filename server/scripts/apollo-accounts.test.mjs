/**
 * Bring-your-own Apollo: which account a lookup uses, and who pays for it.
 *
 *   node server/scripts/apollo-accounts.test.mjs
 *
 * Two sources with very different billing. The PLATFORM key is shared and paid
 * for by us, so using it costs the workspace platform credits. A WORKSPACE key
 * spends that customer's own Apollo quota, so charging platform credits on top
 * would bill them twice for one lookup.
 *
 * Mirrors resolveApolloCredentials in services/apollo/credentials.ts.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

const PLATFORM = { enabled: true, key: "platform-key" };

/** Mirrors the resolver: workspace key first, platform key as fallback. */
function resolve(workspaceId, accounts, platform = PLATFORM) {
  const own = accounts
    .filter((a) => a.workspaceId === workspaceId && a.status !== "ERROR")
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt - a.createdAt)[0];

  if (own && own.key) {
    return { apiKey: own.key, source: "workspace", billsPlatformCredits: false, accountId: own.id };
  }
  if (!platform.enabled || !platform.key) return null;
  return { apiKey: platform.key, source: "platform", billsPlatformCredits: true, accountId: null };
}

const acct = (id, workspaceId, key, opts = {}) => ({
  id, workspaceId, key,
  isDefault: opts.isDefault ?? false,
  status: opts.status ?? "ACTIVE",
  createdAt: opts.createdAt ?? 0,
});

console.log("who pays");
t("no connected key — platform key, and platform credits are charged", () => {
  const r = resolve("w1", []);
  assert.equal(r.source, "platform");
  assert.equal(r.billsPlatformCredits, true);
});
t("own key — their Apollo quota, so NO platform credits", () => {
  const r = resolve("w1", [acct("a", "w1", "k")]);
  assert.equal(r.source, "workspace");
  assert.equal(r.billsPlatformCredits, false,
    "charging here would bill the customer twice for one lookup");
});
t("a refund is only owed when we actually charged", () => {
  // Mirrors the guarded grantCredits calls in revealApolloPerson.
  const refundOwed = (creds) => creds.billsPlatformCredits;
  assert.equal(refundOwed(resolve("w1", [])), true);
  assert.equal(refundOwed(resolve("w1", [acct("a", "w1", "k")])), false,
    "refunding an uncharged reveal would mint free credits");
});

console.log("isolation — one workspace's key must never serve another");
t("workspace B does not get workspace A's key", () => {
  const accounts = [acct("a", "wA", "secret-A")];
  assert.equal(resolve("wA", accounts).apiKey, "secret-A");
  const b = resolve("wB", accounts);
  assert.equal(b.source, "platform");
  assert.notEqual(b.apiKey, "secret-A");
});
t("a null workspace (no session context) never reaches a workspace key", () => {
  const r = resolve(null, [acct("a", "wA", "secret-A")]);
  assert.equal(r.source, "platform");
});

console.log("choosing between several keys");
t("the default wins over a newer non-default", () => {
  const accounts = [
    acct("old", "w1", "chosen", { isDefault: true, createdAt: 1 }),
    acct("new", "w1", "other", { createdAt: 99 }),
  ];
  assert.equal(resolve("w1", accounts).apiKey, "chosen");
});
t("with no default set, the newest usable key is used", () => {
  const accounts = [
    acct("old", "w1", "older", { createdAt: 1 }),
    acct("new", "w1", "newer", { createdAt: 99 }),
  ];
  assert.equal(resolve("w1", accounts).apiKey, "newer");
});
t("an ERRORed key is skipped in favour of a working one", () => {
  const accounts = [
    acct("bad", "w1", "revoked", { isDefault: true, status: "ERROR", createdAt: 99 }),
    acct("good", "w1", "works", { createdAt: 1 }),
  ];
  assert.equal(resolve("w1", accounts).apiKey, "works");
});
t("every key errored falls back to the platform — and billing resumes", () => {
  const r = resolve("w1", [acct("bad", "w1", "revoked", { status: "ERROR" })]);
  assert.equal(r.source, "platform");
  assert.equal(r.billsPlatformCredits, true,
    "back on the shared key means back on platform credits");
});

console.log("platform key unavailable");
t("no workspace key and Apollo disabled means no credentials at all", () =>
  assert.equal(resolve("w1", [], { enabled: false, key: "x" }), null));
t("a workspace key still works when the platform key is disabled", () => {
  const r = resolve("w1", [acct("a", "w1", "k")], { enabled: false, key: null });
  assert.equal(r.source, "workspace");
});

console.log("search cache must not cross accounts");
const cacheKey = (filter, accountId) => JSON.stringify({ ...filter, acct: accountId ?? "platform" });
t("the same filter on two accounts does not share a cache entry", () => {
  const f = { seniorities: ["owner"] };
  assert.notEqual(cacheKey(f, "acct-A"), cacheKey(f, "acct-B"));
  assert.notEqual(cacheKey(f, "acct-A"), cacheKey(f, null));
});
t("the same filter on the same account does hit cache", () =>
  assert.equal(cacheKey({ seniorities: ["owner"] }, "acct-A"), cacheKey({ seniorities: ["owner"] }, "acct-A")));

console.log(`\n${n}/${n} passed`);
