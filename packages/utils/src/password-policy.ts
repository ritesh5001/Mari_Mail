/**
 * Password policy — the single source of truth for BOTH the signup form and
 * the API.
 *
 * It lives in a shared package on purpose: if the client showed a green tick
 * for a rule the server didn't enforce (or vice-versa) users would satisfy the
 * on-screen checklist and still be rejected. Keeping one implementation makes
 * that drift impossible.
 *
 * Deliberately free of Node built-ins so it is safe to import into a browser
 * bundle — hence a separate module rather than the package barrel, which pulls
 * in `node:crypto`.
 *
 * Policy: 8+ characters AND at least 3 of the 4 character classes. That is
 * marginally STRONGER than the previous "10 characters, no composition" rule
 * at the weak end (62^8 ≈ 47.6 bits vs 26^10 ≈ 47.0 bits), and it pairs with
 * the server-side breached-password check, which is what actually stops the
 * passwords people really choose.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MIN_CLASSES = 3;

export type PasswordClassId = "lower" | "upper" | "number" | "special";

export const PASSWORD_CLASSES: Array<{ id: PasswordClassId; label: string; test: (v: string) => boolean }> = [
  { id: "lower", label: "Lower case letters (a-z)", test: (v) => /[a-z]/.test(v) },
  { id: "upper", label: "Upper case letters (A-Z)", test: (v) => /[A-Z]/.test(v) },
  { id: "number", label: "Numbers (0-9)", test: (v) => /[0-9]/.test(v) },
  { id: "special", label: "Special characters (e.g. !@#$%^&*)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export type PasswordEvaluation = {
  /** Meets the minimum length. */
  lengthOk: boolean;
  /** Per-class satisfaction, in display order. */
  classes: Array<{ id: PasswordClassId; label: string; ok: boolean }>;
  /** How many distinct classes are present. */
  classesMet: number;
  /** Meets the "at least N of the following" rule. */
  classesOk: boolean;
  /** Overall pass/fail. */
  valid: boolean;
};

export function evaluatePassword(value: string): PasswordEvaluation {
  const classes = PASSWORD_CLASSES.map((c) => ({ id: c.id, label: c.label, ok: c.test(value) }));
  const classesMet = classes.filter((c) => c.ok).length;
  const lengthOk = value.length >= PASSWORD_MIN_LENGTH;
  const classesOk = classesMet >= PASSWORD_MIN_CLASSES;
  return { lengthOk, classes, classesMet, classesOk, valid: lengthOk && classesOk };
}

/** Human-readable reason a password was rejected, or null when it's fine. */
export function passwordProblem(value: string): string | null {
  const result = evaluatePassword(value);
  if (!result.lengthOk) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!result.classesOk) {
    return `Password must include at least ${PASSWORD_MIN_CLASSES} of: lower case, upper case, numbers, special characters.`;
  }
  return null;
}
