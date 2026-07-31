/**
 * Signature verification is the only thing standing between a stranger with
 * curl and a free paid plan, so it gets tests.
 *
 *   node server/scripts/razorpay-signature.test.mjs
 *
 * Transpiles the real source with the TypeScript already in node_modules, so
 * these run against the shipped implementation rather than a copy.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const ts = (await import(new URL("../node_modules/typescript/lib/typescript.js", import.meta.url).href)).default;
const src = readFileSync(new URL("../src/services/razorpay.service.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import("data:text/javascript," + encodeURIComponent(js));
const { verifyPaymentSignature, verifyWebhookSignature, razorpayConfig } = mod;

const KEY_SECRET = "test_secret_do_not_use";
const WEBHOOK_SECRET = "test_webhook_secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const sign = (secret, payload) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

console.log("verifyPaymentSignature — browser callback");
const orderId = "order_ABC123";
const paymentId = "pay_XYZ789";
const good = sign(KEY_SECRET, `${orderId}|${paymentId}`);

t("accepts a genuine signature", () =>
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: good }), true));
t("FORGERY: rejects a signature made with the wrong secret", () =>
  assert.equal(verifyPaymentSignature({
    orderId, paymentId, signature: sign("attacker_guess", `${orderId}|${paymentId}`),
  }), false));
t("TAMPER: rejects when the order id is swapped", () =>
  assert.equal(verifyPaymentSignature({
    orderId: "order_OTHER", paymentId, signature: good,
  }), false));
t("TAMPER: rejects when the payment id is swapped", () =>
  assert.equal(verifyPaymentSignature({
    orderId, paymentId: "pay_OTHER", signature: good,
  }), false));
t("rejects the separator being moved (order|payment vs orderpayment|)", () =>
  assert.equal(verifyPaymentSignature({
    orderId: orderId + "|" + paymentId, paymentId: "", signature: good,
  }), false));
t("rejects an empty signature", () =>
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: "" }), false));
t("rejects non-hex junk without throwing", () =>
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: "zzzz" }), false));
t("rejects a truncated signature", () =>
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: good.slice(0, 32) }), false));

console.log("verifyWebhookSignature — server-to-server");
const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: { x: 1 } }));
t("accepts a genuine delivery", () =>
  assert.equal(verifyWebhookSignature(body, sign(WEBHOOK_SECRET, body)), true));
t("rejects a body modified after signing", () =>
  assert.equal(verifyWebhookSignature(Buffer.from(JSON.stringify({ event: "payment.captured", payload: { x: 2 } })), sign(WEBHOOK_SECRET, body)), false));
t("rejects a signature made with the API key secret instead of the webhook secret", () =>
  assert.equal(verifyWebhookSignature(body, sign(KEY_SECRET, body)), false));
t("rejects a missing signature header", () =>
  assert.equal(verifyWebhookSignature(body, undefined), false));

console.log("fails closed when unconfigured");
delete process.env.RAZORPAY_WEBHOOK_SECRET;
t("no webhook secret -> every delivery rejected", () =>
  assert.equal(verifyWebhookSignature(body, sign(WEBHOOK_SECRET, body)), false));
delete process.env.RAZORPAY_KEY_SECRET;
t("no API secret -> every callback rejected", () =>
  assert.equal(verifyPaymentSignature({ orderId, paymentId, signature: good }), false));
t("razorpayConfig() is null when unconfigured", () =>
  assert.equal(razorpayConfig(), null));

console.log(`\n${n}/${n} passed`);
