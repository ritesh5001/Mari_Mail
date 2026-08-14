import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { referralSummary, resolveReferralCode } from "../services/referral.service.js";

/**
 * The referral programme's read surface.
 *
 * There is no "create referral" endpoint on purpose: a referral is created by
 * someone signing up with a code, never by asking for one. Anything else would
 * let a user mint attributions for accounts that don't exist.
 */
export const referralRouter = Router();

/** The signed-in user's code, their invitees, and what they've earned. */
referralRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    return sendData(res, await referralSummary(userId));
  } catch (error) {
    return next(error);
  }
});

const lookupSchema = z.object({ code: z.string().trim().min(1).max(32) });

/**
 * Unauthenticated: the register form calls this to confirm a `?ref=` code
 * before someone fills in a whole signup, and to show whose invite it is.
 *
 * Returns only the referrer's display name — never their email, workspace or
 * id. A referral code is shareable by design, so it must not be a lookup key
 * for anyone's contact details.
 */
referralRouter.get("/lookup", async (req, res, next) => {
  try {
    const parsed = lookupSchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "A code is required");
    }
    const owner = await resolveReferralCode(parsed.data.code);
    if (!owner) return sendData(res, { valid: false, referrerName: null });
    return sendData(res, { valid: true, referrerName: owner.name });
  } catch (error) {
    return next(error);
  }
});
