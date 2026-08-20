/**
 * Every value of the `CreditLedgerReason` enum, in plain words.
 *
 * The ledger used to render `reason.toLowerCase().replace(/_/g, " ")`, which
 * turned PLAN_REPLENISH into "plan replenish" — a phrase no customer uses.
 * Both the Credits tab and the activity feed describe the same rows, so the
 * wording lives here rather than in whichever component was written first.
 *
 * Keyed by string rather than the enum type: these values arrive from the
 * database as strings, and an unrecognised one falls back to the old
 * de-underscored form rather than rendering blank.
 */
const REASON_LABEL: Record<string, string> = {
  PLAN_REPLENISH: "Monthly plan credits",
  ADD_ON_PURCHASE: "Credit top-up purchased",
  ADMIN_GRANT: "Granted by MariMail",
  REFERRAL_REWARD: "Referral reward",
  VIEW_VESSEL: "Viewed a global vessel",
  SAVE_VESSEL: "Saved a global vessel",
  EXPORT_VESSEL: "Exported a vessel",
  REVEAL_EMAIL: "Revealed an email address",
  REVEAL_PHONE: "Revealed a mobile number",
  WATERFALL_EMAIL: "Email waterfall search",
  REFUND: "Refunded",
  ADJUSTMENT: "Manual adjustment",
};

export function creditReasonLabel(reason: string) {
  return REASON_LABEL[reason] ?? reason.toLowerCase().replace(/_/g, " ");
}
