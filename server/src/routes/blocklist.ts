import { Router } from "express";
import { z } from "zod";
import { prisma, type BlockKind, type Prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import {
  companyBlockValue,
  emailDomain,
  isPublicEmailDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
} from "../services/blocklist.service.js";

/**
 * The workspace do-not-contact list: block a person, or a whole company, and
 * they stop being eligible for every campaign in this workspace.
 *
 * Blocking is retroactive on purpose. "Never contact them again" would be a
 * half-truth if a send queued five minutes ago still went out, so adding a
 * block also stands down anything already scheduled for the people it covers.
 */
export const blocklistRouter = Router();

const listQuerySchema = z.object({
  kind: z.enum(["CONTACT", "COMPANY"]).optional(),
  query: z.string().trim().max(200).optional(),
});

blocklistRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const { kind, query } = parsed.data;

    const where: Prisma.WorkspaceBlockWhereInput = {
      workspaceId,
      ...(kind ? { kind } : {}),
      ...(query
        ? {
            OR: [
              { value: { contains: query.toLowerCase() } },
              { label: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [blocks, contacts, companies] = await Promise.all([
      prisma.workspaceBlock.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.workspaceBlock.count({ where: { workspaceId, kind: "CONTACT" } }),
      prisma.workspaceBlock.count({ where: { workspaceId, kind: "COMPANY" } }),
    ]);

    return sendData(res, { blocks, counts: { contacts, companies } });
  } catch (error) {
    return next(error);
  }
});

const createSchema = z
  .object({
    kind: z.enum(["CONTACT", "COMPANY"]),
    /** CONTACT: the address to block. */
    email: z.string().email().optional(),
    /** COMPANY: any of these; the best available becomes the match key. */
    domain: z.string().max(255).optional(),
    website: z.string().max(500).optional(),
    companyName: z.string().max(255).optional(),
    label: z.string().max(255).optional(),
    contactId: z.string().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.kind !== "CONTACT" || Boolean(v.email), {
    message: "An email address is required to block a contact.",
    path: ["email"],
  })
  .refine((v) => v.kind !== "COMPANY" || Boolean(v.domain || v.website || v.companyName || v.email), {
    message: "A company domain or name is required to block a company.",
    path: ["companyName"],
  });

blocklistRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const input = parsed.data;
    const kind = input.kind as BlockKind;

    let value: string | null;
    if (kind === "CONTACT") {
      value = normalizeEmail(input.email as string);
    } else {
      value = companyBlockValue(input);
      // A free-mail domain identifies a mailbox provider, not a company.
      // Blocking gmail.com would silently mute a third of most address books,
      // so it is refused rather than quietly widened.
      const asDomain = normalizeDomain(input.domain ?? input.website) ?? emailDomain(input.email);
      if (asDomain && isPublicEmailDomain(asDomain) && !normalizeCompanyName(input.companyName)) {
        return sendError(
          res,
          400,
          "PUBLIC_DOMAIN",
          `${asDomain} is a public email provider, not a company. Block the individual contact instead.`,
        );
      }
    }

    if (!value) {
      return sendError(res, 400, "VALIDATION_ERROR", "Could not work out what to block from that input.");
    }

    const label =
      input.label ??
      (kind === "CONTACT" ? (input.email as string) : (input.companyName ?? value));

    const block = await prisma.workspaceBlock.upsert({
      where: { workspaceId_kind_value: { workspaceId, kind, value } },
      update: {
        // Re-blocking refreshes the note and label rather than erroring.
        label,
        reason: input.reason ?? null,
        createdById: userId,
      },
      create: {
        workspaceId,
        kind,
        value,
        label,
        contactId: input.contactId ?? null,
        reason: input.reason ?? null,
        createdById: userId,
      },
    });

    const standDown = await standDownQueuedSends(workspaceId, kind, value);

    return sendData(res, { block, cancelledSends: standDown }, 201);
  } catch (error) {
    return next(error);
  }
});

blocklistRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.workspaceBlock.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true },
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Block not found");

    await prisma.workspaceBlock.delete({ where: { id: existing.id } });
    return sendData(res, { id: existing.id });
  } catch (error) {
    return next(error);
  }
});

/**
 * Stops anything already queued for the people a new block covers.
 *
 * Only touches rows that have not been sent yet — PENDING / SCHEDULED /
 * STAGED. A SENT or REPLIED row is history and must stay readable in the
 * campaign's reporting; rewriting it would corrupt the numbers to no purpose,
 * since a sent email cannot be recalled.
 */
async function standDownQueuedSends(workspaceId: string, kind: BlockKind, value: string) {
  const contactWhere: Prisma.ContactWhereInput =
    kind === "CONTACT"
      ? { email: { equals: value, mode: "insensitive" } }
      : {
          OR: [
            // Domain form: the address ends with "@domain".
            { email: { endsWith: `@${value}`, mode: "insensitive" } },
            { website: { contains: value, mode: "insensitive" } },
            // Name form: the stored name still carries the suffixes we strip,
            // so match on containment rather than equality.
            { companyName: { contains: value, mode: "insensitive" } },
          ],
        };

  const contacts = await prisma.contact.findMany({
    where: { AND: [{ OR: [{ workspaceId }, { workspaceId: null }] }, contactWhere] },
    select: { id: true },
    take: 5_000,
  });
  if (contacts.length === 0) return 0;

  const result = await prisma.campaignContact.updateMany({
    where: {
      workspaceId,
      contactId: { in: contacts.map((contact) => contact.id) },
      status: { in: ["PENDING", "SCHEDULED", "STAGED"] },
    },
    data: { status: "PAUSED", nextSendAt: null },
  });
  return result.count;
}
