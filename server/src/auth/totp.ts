import crypto from "node:crypto";

/**
 * TOTP (RFC 6238) implemented on Node's crypto rather than pulling in a
 * dependency — it's ~40 lines of HMAC-SHA1 and avoids another package to
 * install on the deploy box.
 *
 * Compatible with Google Authenticator, 1Password, Authy: SHA-1, 6 digits,
 * 30-second period (the defaults every authenticator app assumes).
 */

const DIGITS = 6;
const PERIOD = 30;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 encode (no padding) — the format authenticator apps expect. */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character in TOTP secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32-encoded for the authenticator app. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The `otpauth://` URI a QR code encodes. */
export function totpAuthUri(secret: string, account: string, issuer = "MariMail"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function codeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  // Dynamic truncation (RFC 4226 §5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Verify a submitted code.
 *
 * `window` allows ±N periods of clock drift between the phone and the server —
 * 1 (±30s) is the usual choice. Comparison is constant-time so a submitted code
 * can't be recovered a digit at a time via response timing.
 */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const clean = token.replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let drift = -window; drift <= window; drift++) {
    const expected = codeForCounter(secret, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * Single-use recovery codes for when the authenticator device is lost. We
 * return the plaintext once (to show the user) and the hashes to store — the
 * plaintext is never persisted.
 */
export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  const hashed = plain.map((code) => crypto.createHash("sha256").update(code).digest("hex"));
  return { plain, hashed };
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
