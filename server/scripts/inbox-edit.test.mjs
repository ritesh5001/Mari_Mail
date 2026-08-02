/**
 * Editing a connected mailbox's credentials.
 *
 *   node server/scripts/inbox-edit.test.mjs
 *
 * Two rules decide whether correcting a typo'd password actually gets the
 * mailbox sending again. Both are easy to get subtly wrong and neither is
 * visible from the UI until someone's campaign silently stops.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// --- rule 1: an omitted password must not wipe the stored one -------------
// Mirrors `if (input.data.smtpPassword !== undefined)` in routes/inboxes.ts.
function buildUpdate(body) {
  const data = {};
  if (body.smtpHost !== undefined) data.smtpHost = body.smtpHost;
  if (body.smtpPort !== undefined) data.smtpPort = body.smtpPort;
  if (body.smtpUser !== undefined) data.smtpUser = body.smtpUser;
  if (body.smtpPassword !== undefined) data.encryptedPassword = `enc(${body.smtpPassword})`;
  if (body.smtpSecure !== undefined) data.smtpSecure = body.smtpSecure;
  return data;
}

console.log("password preservation — the stored secret can't be pre-filled");
t("omitting the password leaves encryptedPassword untouched", () => {
  const data = buildUpdate({ smtpHost: "smtp.new.com", smtpPort: 587 });
  assert.equal("encryptedPassword" in data, false,
    "a blank password field must not clear the working password");
});
t("sending a password replaces it", () => {
  const data = buildUpdate({ smtpPassword: "corrected" });
  assert.equal(data.encryptedPassword, "enc(corrected)");
});
t("host-only edits still apply", () => {
  const data = buildUpdate({ smtpHost: "smtp.hostinger.com" });
  assert.equal(data.smtpHost, "smtp.hostinger.com");
  assert.equal("encryptedPassword" in data, false);
});
t("port 0 and smtpSecure false are real values, not 'unset'", () => {
  const data = buildUpdate({ smtpPort: 0, smtpSecure: false });
  assert.equal(data.smtpPort, 0);
  assert.equal(data.smtpSecure, false);
});

// --- rule 2: fixing credentials clears a stale ERROR ----------------------
function resolveStatus({ body, currentStatus }) {
  const credentialsChanged =
    body.smtpPassword !== undefined ||
    body.smtpHost !== undefined ||
    body.smtpUser !== undefined ||
    body.smtpPort !== undefined ||
    body.smtpSecure !== undefined;
  if (body.status !== undefined) return body.status;
  if (credentialsChanged && currentStatus === "ERROR") return "ACTIVE";
  return currentStatus;
}

console.log("stale ERROR — the reason a fixed mailbox still wouldn't send");
t("THE BUG: correcting the password reactivates an ERRORed mailbox", () =>
  assert.equal(resolveStatus({ body: { smtpPassword: "right" }, currentStatus: "ERROR" }), "ACTIVE"));
t("correcting the host also reactivates it", () =>
  assert.equal(resolveStatus({ body: { smtpHost: "smtp.fixed.com" }, currentStatus: "ERROR" }), "ACTIVE"));
t("a PAUSED mailbox is NOT resurrected — pausing was deliberate", () =>
  assert.equal(resolveStatus({ body: { smtpPassword: "x" }, currentStatus: "PAUSED" }), "PAUSED"));
t("an ACTIVE mailbox stays active", () =>
  assert.equal(resolveStatus({ body: { smtpPassword: "x" }, currentStatus: "ACTIVE" }), "ACTIVE"));
t("renaming alone does NOT clear an ERROR — nothing was actually fixed", () =>
  assert.equal(resolveStatus({ body: { displayName: "New name" }, currentStatus: "ERROR" }), "ERROR"));
t("an explicit status in the same request wins", () =>
  assert.equal(
    resolveStatus({ body: { smtpPassword: "x", status: "PAUSED" }, currentStatus: "ERROR" }),
    "PAUSED",
  ));

console.log(`\n${n}/${n} passed`);
