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

type BlockInput = {
  email?: string;
  domain?: string;
  website?: string;
  companyName?: string;
};

/**
 * The stored match key for a block, or why it can't be worked out.
 *
 * Shared by create and preview so the preview can never describe a different
 * block from the one that would actually be saved.
 */
function resolveBlockValue(
  kind: BlockKind,
  input: BlockInput,
): { value: string; values: string[] } | { error: { code: string; message: string } } {
  if (kind === "CONTACT") {
    const email = normalizeEmail(input.email as string);
    return { value: email, values: [email] };
  }

  // A free-mail domain identifies a mailbox provider, not a company. Blocking
  // gmail.com would silently mute a third of most address books, so it is
  // refused rather than quietly widened.
  const asDomain = normalizeDomain(input.domain ?? input.website) ?? emailDomain(input.email);
  if (asDomain && isPublicEmailDomain(asDomain) && !normalizeCompanyName(input.companyName)) {
    return {
      error: {
        code: "PUBLIC_DOMAIN",
        message: `${asDomain} is a public email provider, not a company. Block the individual contact instead.`,
      },
    };
  }

  // Record EVERY identifier the company is known by, not just the best one.
  //
  // Provider rows are inconsistent: one person at COSCO arrives with
  // `cosco.com`, the next with only "COSCO SHIPPING" and a placeholder email.
  // A block stored under the domain alone could not match the second row, so
  // blocking a company left some of its people in the results — which is
  // exactly the bug this is fixing. Storing both keys makes any row shape
  // match, and the unique index keeps repeats idempotent.
  const keys = new Set<string>();
  const domain = companyBlockValue({ domain: input.domain, website: input.website, email: input.email });
  if (domain && domain.includes(".")) keys.add(domain);
  const name = normalizeCompanyName(input.companyName);
  if (name) keys.add(name);
  // Fall back to whatever the general resolver finds (e.g. a name-derived key
  // when there is no usable domain).
  if (keys.size === 0) {
    const fallback = companyBlockValue(input);
    if (fallback) keys.add(fallback);
  }

  if (keys.size === 0) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Could not work out what to block from that input.",
      },
    };
  }
  return { value: Array.from(keys)[0], values: Array.from(keys) };
}

/** Contacts a block with this key would cover. */
function coveredContactWhere(kind: BlockKind, value: string): Prisma.ContactWhereInput {
  return kind === "CONTACT"
    ? { email: { equals: value, mode: "insensitive" } }
    : {
        OR: [
          // Domain form: the address ends with "@domain".
          { email: { endsWith: `@${value}`, mode: "insensitive" } },
          // `website` is nullable and this clause is used positively here, but
          // the null check keeps it identical to the read-side exclusion.
          { AND: [{ website: { not: null } }, { website: { contains: value, mode: "insensitive" } }] },
          // Name form: the stored name still carries the suffixes we strip,
          // so match on containment rather than equality.
          { companyName: { contains: value, mode: "insensitive" } },
        ],
      };
}

blocklistRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const input = parsed.data;
    const kind = input.kind as BlockKind;

    const resolved = resolveBlockValue(kind, input);
    if ("error" in resolved) {
      return sendError(res, 400, resolved.error.code, resolved.error.message);
    }
    const value = resolved.value;

    const label =
      input.label ??
      (kind === "CONTACT" ? (input.email as string) : (input.companyName ?? value));

    // One row per identifier — a company known by both a domain and a name
    // gets both, so no row shape can slip past the match.
    const blocks = [];
    for (const key of resolved.values) {
      blocks.push(
        await prisma.workspaceBlock.upsert({
          where: { workspaceId_kind_value: { workspaceId, kind, value: key } },
          update: {
            // Re-blocking refreshes the note and label rather than erroring.
            label,
            reason: input.reason ?? null,
            createdById: userId,
          },
          create: {
            workspaceId,
            kind,
            value: key,
            label,
            contactId: input.contactId ?? null,
            reason: input.reason ?? null,
            createdById: userId,
          },
        }),
      );
    }

    // Each key can cover different people, so the impact is the union.
    const impact = { contacts: 0, lists: 0, cancelledSends: 0 };
    for (const key of resolved.values) {
      const one = await applyBlockRetroactively(workspaceId, kind, key);
      impact.contacts += one.contacts;
      impact.lists += one.lists;
      impact.cancelledSends += one.cancelledSends;
    }

    return sendData(res, { block: blocks[0], blocks, impact }, 201);
  } catch (error) {
    return next(error);
  }
});

const previewSchema = z.object({
  kind: z.enum(["CONTACT", "COMPANY"]),
  email: z.string().optional(),
  domain: z.string().max(255).optional(),
  website: z.string().max(500).optional(),
  companyName: z.string().max(255).optional(),
});

/**
 * What blocking this would do, without doing it.
 *
 * Blocking a company removes its people from every list, and that cannot be
 * undone by unblocking — the memberships are gone. Reporting "removed 12
 * contacts from 4 lists" afterwards is too late to be a choice, so the UI asks
 * first whenever the number is not zero.
 */
blocklistRouter.post("/preview", requireAuth, async (req, res, next) => {
  try {
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const kind = parsed.data.kind as BlockKind;

    const resolved = resolveBlockValue(kind, parsed.data);
    if ("error" in resolved) {
      return sendError(res, 400, resolved.error.code, resolved.error.message);
    }

    const contacts = await prisma.contact.findMany({
      where: {
        AND: [{ OR: [{ workspaceId }, { workspaceId: null }] }, coveredContactWhere(kind, resolved.value)],
      },
      select: { id: true },
      take: 5_000,
    });

    if (contacts.length === 0) {
      return sendData(res, { value: resolved.value, contacts: 0, lists: 0, queuedSends: 0 });
    }
    const contactIds = contacts.map((contact) => contact.id);

    const [memberships, queuedSends] = await Promise.all([
      prisma.listContact.findMany({
        where: { contactId: { in: contactIds }, list: { workspaceId } },
        select: { listId: true },
      }),
      prisma.campaignContact.count({
        where: {
          workspaceId,
          contactId: { in: contactIds },
          status: { in: ["PENDING", "SCHEDULED", "STAGED"] },
        },
      }),
    ]);

    return sendData(res, {
      value: resolved.value,
      contacts: contactIds.length,
      lists: new Set(memberships.map((row) => row.listId)).size,
      queuedSends,
    });
  } catch (error) {
    return next(error);
  }
});

blocklistRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.workspaceBlock.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true, kind: true, value: true },
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Block not found");

    await prisma.workspaceBlock.delete({ where: { id: existing.id } });

    // Put back what the block paused.
    //
    // Blocking parked queued sends at PAUSED; without this they stay parked
    // forever, so unblocking looked like it had worked while the campaign
    // quietly never resumed. List memberships are NOT restored — those rows
    // were deleted, and inventing them again would be guessing at which lists
    // the user meant.
    const covered = await prisma.contact.findMany({
      where: {
        AND: [
          { OR: [{ workspaceId }, { workspaceId: null }] },
          coveredContactWhere(existing.kind, existing.value),
        ],
      },
      select: { id: true },
      take: 5_000,
    });

    let resumedSends = 0;
    if (covered.length > 0) {
      const resumed = await prisma.campaignContact.updateMany({
        where: {
          workspaceId,
          contactId: { in: covered.map((contact) => contact.id) },
          status: "PAUSED",
        },
        data: { status: "PENDING" },
      });
      resumedSends = resumed.count;
    }

    return sendData(res, { id: existing.id, resumedSends });
  } catch (error) {
    return next(error);
  }
});

/**
 * Makes a new block retroactive.
 *
 * Blocking means "I never want to see these people again", so it is not enough
 * to filter them out of future reads: they are removed from every list in the
 * workspace and anything already queued for them is stood down. Returns what
 * it did, so the UI can report it — a company block that silently changed
 * nothing visible was the reason blocking felt broken.
 */
async function applyBlockRetroactively(workspaceId: string, kind: BlockKind, value: string) {
  const contactWhere = coveredContactWhere(kind, value);

  const contacts = await prisma.contact.findMany({
    where: { AND: [{ OR: [{ workspaceId }, { workspaceId: null }] }, contactWhere] },
    select: { id: true },
    take: 5_000,
  });
  if (contacts.length === 0) return { contacts: 0, lists: 0, cancelledSends: 0 };

  const contactIds = contacts.map((contact) => contact.id);

  // Which of the workspace's own lists they sit in — read before the delete,
  // because afterwards there is nothing left to count.
  const memberships = await prisma.listContact.findMany({
    where: { contactId: { in: contactIds }, list: { workspaceId } },
    select: { listId: true },
  });
  const perList = new Map<string, number>();
  for (const row of memberships) perList.set(row.listId, (perList.get(row.listId) ?? 0) + 1);

  if (perList.size > 0) {
    await prisma.$transaction([
      prisma.listContact.deleteMany({
        where: { contactId: { in: contactIds }, list: { workspaceId } },
      }),
      // `contactCount` is a denormalised column, so it has to be adjusted by
      // hand or the list header keeps counting people who are no longer there.
      ...Array.from(perList.entries()).map(([listId, removed]) =>
        prisma.contactList.update({
          where: { id: listId },
          data: { contactCount: { decrement: removed } },
        }),
      ),
    ]);
  }

  // Stand down anything queued. SENT and REPLIED rows are left alone — they are
  // history, and a sent email cannot be recalled by editing a row.
  const stoodDown = await prisma.campaignContact.updateMany({
    where: {
      workspaceId,
      contactId: { in: contactIds },
      status: { in: ["PENDING", "SCHEDULED", "STAGED"] },
    },
    data: { status: "PAUSED", nextSendAt: null },
  });

  return {
    contacts: contactIds.length,
    lists: perList.size,
    cancelledSends: stoodDown.count,
  };
}
