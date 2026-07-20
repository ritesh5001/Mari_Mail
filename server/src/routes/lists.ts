import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { matchContactToVessel } from "@marimail/utils";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceScope } from "../services/workspace-scope.js";
import { companyExists, resolveListMembers } from "../services/lists.service.js";
import { reconcileCampaignsForList } from "../services/campaign-list-reconciler.js";

export const listRouter = Router();

/** Lists are private to their owner: scope by workspace AND ownerId. */
function ownedListScope(workspaceId: string, userId: string) {
  return { ...workspaceScope(workspaceId), ownerId: userId };
}

const createSchema = z.object({
  name: z.string().trim().min(2),
  type: z.enum(["STATIC", "SMART"]),
  filterConfig: z.unknown().optional(),
  color: z.string().default("#0077B6"),
  icon: z.string().default("users"),
  // "ETA" lists hold contacts, companies AND vessels (the current default —
  // used when the campaign target is per-vessel ETAs). "CONTACT" lists hold
  // only contacts and companies (for cold campaigns / CSV-imported audiences).
  // Persisted inside `filterConfig.kind` so we don't need a schema migration.
  kind: z.enum(["ETA", "CONTACT"]).optional(),
});

const companyKindEnum = z.enum(["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER", "GENERIC"]);

const addCompaniesSchema = z.object({
  companies: z
    .array(z.object({ companyId: z.string().min(1), companyKind: companyKindEnum }))
    .min(1),
});

listRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;

    // Lists are fully private to their owner; the `scope` param is ignored.
    // Include a live vessel count via _count so the UI can show it without a
    // second round-trip. contactCount / companyCount are persisted columns.
    const rows = await prisma.contactList.findMany({
      where: { AND: [workspaceScope(workspaceId), { isArchived: false }, { ownerId: userId }] },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { vessels: true } } },
    });
    const lists = rows.map(({ _count, ...list }) => ({ ...list, vesselCount: _count.vessels }));
    return sendData(res, { lists });
  } catch (error) {
    return next(error);
  }
});

listRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    // Merge the kind marker into filterConfig (creating {} if the caller
    // didn't send one). SMART lists put their query criteria here — we
    // preserve that if the caller sent it.
    const baseConfig =
      input.data.filterConfig && typeof input.data.filterConfig === "object" && !Array.isArray(input.data.filterConfig)
        ? (input.data.filterConfig as Record<string, unknown>)
        : {};
    const mergedConfig: Record<string, unknown> | undefined = input.data.kind
      ? { ...baseConfig, kind: input.data.kind }
      : Object.keys(baseConfig).length > 0
        ? baseConfig
        : undefined;
    const list = await prisma.contactList.create({
      data: {
        workspaceId,
        ownerId: userId,
        name: input.data.name,
        type: input.data.type,
        filterConfig: (mergedConfig ?? undefined) as Prisma.InputJsonValue | undefined,
        color: input.data.color,
        icon: input.data.icon,
      },
    });
    return sendData(res, list, 201);
  } catch (error) {
    return next(error);
  }
});

listRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const result = await resolveListMembers(workspaceId, userId, req.params.id);
    if (!result) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }
    return sendData(res, result);
  } catch (error) {
    return next(error);
  }
});

// Delete an entire list. Ownership-scoped so users can only delete their own.
// Prisma cascades handle the ListVessel / ListContact / ListCompany rows.
// Contacts, vessels, and companies themselves stay in the DB — a list is
// just a bookmark set, not the source of truth for those records.
listRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
      select: { id: true },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }
    await prisma.contactList.delete({ where: { id: list.id } });
    return sendData(res, { removed: true });
  } catch (error) {
    return next(error);
  }
});

listRouter.post("/:id/vessels", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ vesselIds: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }

    const result = await prisma.listVessel.createMany({
      data: input.data.vesselIds.map((vesselId) => ({ listId: list.id, vesselId })),
      skipDuplicates: true,
    });

    if (result.count > 0) {
      void reconcileCampaignsForList(list.id);
    }

    return sendData(res, { added: result.count });
  } catch (error) {
    return next(error);
  }
});

listRouter.delete("/:id/vessels/:vesselId", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }
    await prisma.listVessel.deleteMany({
      where: { listId: list.id, vesselId: req.params.vesselId },
    });
    return sendData(res, { removed: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * Persists Apollo preview rows as workspace-scoped Contact rows and adds them
 * to the list in a single call. Powers the "Add selected to list" button on
 * the list-detail Apollo-role picker: the client sends the previews it's
 * already showing (source of truth = the /external-by-list response it just
 * loaded), and the server materialises them as locked contacts (email set to
 * `apollo-<id>@unknown.local`) so the user can decide when to reveal.
 *
 * Idempotent by (workspaceId, apolloId): a duplicate call finds the existing
 * row instead of creating another one.
 */
const apolloPreviewSchema = z.object({
  externalId: z.string().min(1),
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  title: z.string().nullable().optional(),
  companyName: z.string().default(""),
  // website is the key field the vessel matcher uses when the email is still
  // locked — without it the contact stays unassociated even when its company
  // domain lines up with a vessel's owner/manager company.
  website: z.string().nullable().optional(),
  // Apollo org primary domain — the domain our vessel-derived search matched
  // on. Used to pin the contact↔vessel association at add time, because
  // Apollo bridges related domains (citi.com vs citibank.com) that the
  // matcher can't reconnect later.
  companyDomain: z.string().nullable().optional(),
  personLinkedinUrl: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
});

listRouter.post("/:id/apollo-contacts", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({ apolloRows: z.array(apolloPreviewSchema).min(1).max(200) })
      .safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }

    // Load the list's vessels once so each added contact can be pinned to the
    // vessels whose domains produced the Apollo hit. This is computed NOW —
    // when the search context still exists — because Apollo bridges related
    // domains inside one org (citi.com vs citibank.com) that the matcher can
    // never reconnect from the persisted contact alone.
    const listVessels = await prisma.vessel.findMany({
      where: { listMemberships: { some: { listId: list.id } } },
      include: {
        shipOwnerCompany: true,
        ismManagerCompany: true,
        commercialManagerCompany: true,
      },
    });

    const matchedVesselIdsFor = (row: (typeof input.data.apolloRows)[number]): string[] => {
      const websiteSignal = [row.website, row.companyDomain]
        .filter((value): value is string => Boolean(value))
        .join(", ");
      if (!websiteSignal && !row.companyName) return [];
      // Synthetic matcher input: no email (locked), website carries both the
      // org website AND the primary domain Apollo matched on.
      const probe = {
        id: row.externalId,
        email: null,
        secondaryEmail: null,
        website: websiteSignal || null,
        companyName: row.companyName || null,
      };
      return listVessels
        .filter((vessel) => matchContactToVessel(probe, vessel) !== null)
        .map((vessel) => vessel.id);
    };

    const contactIds: string[] = [];
    for (const row of input.data.apolloRows) {
      const matchedVesselIds = matchedVesselIdsFor(row);
      // Reuse an existing preview if one is already persisted for this
      // (workspace, apolloId) — no duplicate contact rows across successive
      // "Add to list" clicks. Backfill website / personLinkedinUrl /
      // matchedVesselIds on the existing row if the earlier add didn't
      // capture them, so old rows heal on re-add.
      const existing = await prisma.contact.findFirst({
        where: {
          workspaceId,
          source: "APOLLO",
          customFields: { path: ["apolloId"], equals: row.externalId },
        },
        select: { id: true, website: true, personLinkedinUrl: true, customFields: true },
      });
      if (existing) {
        const patch: Prisma.ContactUpdateInput = {};
        if (!existing.website && (row.website || row.companyDomain))
          patch.website = row.website ?? row.companyDomain ?? undefined;
        if (!existing.personLinkedinUrl && row.personLinkedinUrl)
          patch.personLinkedinUrl = row.personLinkedinUrl;
        const existingFields =
          existing.customFields && typeof existing.customFields === "object"
            ? (existing.customFields as Record<string, unknown>)
            : {};
        const existingMatches = Array.isArray(existingFields.matchedVesselIds)
          ? (existingFields.matchedVesselIds as string[])
          : [];
        const mergedMatches = Array.from(new Set([...existingMatches, ...matchedVesselIds]));
        if (mergedMatches.length > existingMatches.length) {
          patch.customFields = { ...existingFields, matchedVesselIds: mergedMatches } as never;
        }
        if (Object.keys(patch).length > 0) {
          await prisma.contact.update({ where: { id: existing.id }, data: patch });
        }
        contactIds.push(existing.id);
        continue;
      }
      const created = await prisma.contact.create({
        data: {
          firstName: row.firstName || "Unknown",
          lastName: row.lastName || "",
          title: row.title ?? undefined,
          companyName: row.companyName || "(unknown)",
          email: `apollo-${row.externalId}@unknown.local`,
          emailStatus: "UNKNOWN" as never,
          website: row.website ?? row.companyDomain ?? undefined,
          personLinkedinUrl: row.personLinkedinUrl ?? undefined,
          country: row.country ?? undefined,
          seniority: (row.seniority as never) ?? ("MID" as never),
          marineRole: "OTHER" as never,
          workspaceId,
          source: "APOLLO",
          verified: false,
          customFields: {
            apolloId: row.externalId,
            locked: true,
            ...(matchedVesselIds.length ? { matchedVesselIds } : {}),
          } as never,
        },
      });
      contactIds.push(created.id);
    }

    const linkResult = await prisma.listContact.createMany({
      data: contactIds.map((contactId) => ({ listId: list.id, contactId })),
      skipDuplicates: true,
    });

    if (linkResult.count > 0) {
      await prisma.contactList.update({
        where: { id: list.id },
        data: { contactCount: { increment: linkResult.count } },
      });
      void reconcileCampaignsForList(list.id);
    }

    return sendData(res, {
      added: linkResult.count,
      persisted: contactIds.length,
      note:
        "Apollo previews are locked — reveal email/phone (1 credit each) from People Finder before launching a campaign to them.",
    });
  } catch (error) {
    return next(error);
  }
});

listRouter.post("/:id/contacts", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ contactIds: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }

    const result = await prisma.listContact.createMany({
      data: input.data.contactIds.map((contactId) => ({ listId: list.id, contactId })),
      skipDuplicates: true,
    });

    await prisma.contactList.update({
      where: { id: list.id },
      data: { contactCount: { increment: result.count } },
    });

    if (result.count > 0) {
      void reconcileCampaignsForList(list.id);
    }

    return sendData(res, { added: result.count });
  } catch (error) {
    return next(error);
  }
});

listRouter.delete("/:id/contacts/:contactId", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }
    const deleted = await prisma.listContact.deleteMany({
      where: { listId: list.id, contactId: req.params.contactId },
    });
    if (deleted.count > 0) {
      await prisma.contactList.update({
        where: { id: list.id },
        data: { contactCount: { decrement: deleted.count } },
      });
    }
    return sendData(res, { removed: true });
  } catch (error) {
    return next(error);
  }
});

listRouter.post("/:id/companies", requireAuth, async (req, res, next) => {
  try {
    const input = addCompaniesSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }

    const validated = await Promise.all(
      input.data.companies.map(async (c) =>
        (await companyExists(workspaceId, c.companyKind, c.companyId)) ? c : null,
      ),
    );
    const rows = validated.filter((c): c is { companyId: string; companyKind: typeof input.data.companies[number]["companyKind"] } => c !== null);

    if (rows.length === 0) {
      return sendError(res, 404, "COMPANY_NOT_FOUND", "No matching companies in this workspace");
    }

    const result = await prisma.listCompany.createMany({
      data: rows.map((r) => ({ listId: list.id, companyId: r.companyId, companyKind: r.companyKind })),
      skipDuplicates: true,
    });

    if (result.count > 0) {
      await prisma.contactList.update({
        where: { id: list.id },
        data: { companyCount: { increment: result.count } },
      });
    }

    return sendData(res, { added: result.count });
  } catch (error) {
    return next(error);
  }
});

listRouter.delete("/:id/companies/:kind/:companyId", requireAuth, async (req, res, next) => {
  try {
    const kindResult = companyKindEnum.safeParse(req.params.kind);
    if (!kindResult.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Unknown company kind");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }
    const deleted = await prisma.listCompany.deleteMany({
      where: { listId: list.id, companyId: req.params.companyId, companyKind: kindResult.data },
    });
    if (deleted.count > 0) {
      await prisma.contactList.update({
        where: { id: list.id },
        data: { companyCount: { decrement: deleted.count } },
      });
    }
    return sendData(res, { removed: true });
  } catch (error) {
    return next(error);
  }
});

// Direct CSV upload for Contact-type lists — creates contact rows from
// user-supplied CSV (parsed on the client) and links them to the list in one
// call. Deliberately sync + capped at 500 rows: the full CSV import pipeline
// under /api/import handles larger jobs with column mapping and validation,
// but that's overkill for a "here's my contact list" list-page upload.
const csvContactRowSchema = z.object({
  firstName: z.string().trim().default(""),
  lastName: z.string().trim().default(""),
  email: z.string().trim().email(),
  companyName: z.string().trim().default(""),
  title: z.string().trim().optional(),
  country: z.string().trim().optional(),
  website: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

listRouter.post("/:id/import-contacts", requireAuth, async (req, res, next) => {
  try {
    const input = z
      .object({ rows: z.array(csvContactRowSchema).min(1).max(500) })
      .safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.id, ...ownedListScope(workspaceId, userId) },
    });
    if (!list) {
      return sendError(res, 404, "LIST_NOT_FOUND", "List not found");
    }

    // Dedupe within the CSV itself (last row wins) so a duplicate email in
    // the file doesn't cause two upsert races.
    const byEmail = new Map<string, z.infer<typeof csvContactRowSchema>>();
    for (const row of input.data.rows) {
      byEmail.set(row.email.toLowerCase(), row);
    }
    const rows = Array.from(byEmail.values());

    // Look up existing contacts by email in this workspace so we don't create
    // duplicates for users who upload the same file twice.
    const emails = rows.map((r) => r.email);
    const existing = await prisma.contact.findMany({
      where: { workspaceId, email: { in: emails } },
      select: { id: true, email: true },
    });
    const existingByEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c.id]));

    const contactIds: string[] = [];
    let created = 0;
    for (const row of rows) {
      const existingId = existingByEmail.get(row.email.toLowerCase());
      if (existingId) {
        contactIds.push(existingId);
        continue;
      }
      const contact = await prisma.contact.create({
        data: {
          workspaceId,
          firstName: row.firstName || "Unknown",
          lastName: row.lastName || "",
          email: row.email,
          companyName: row.companyName || "(unknown)",
          title: row.title || undefined,
          country: row.country || undefined,
          website: row.website || undefined,
          mobilePhone: row.phone || undefined,
          marineRole: "OTHER" as never,
          source: "CSV_IMPORT" as never,
          verified: false,
        },
      });
      contactIds.push(contact.id);
      created += 1;
    }

    const link = await prisma.listContact.createMany({
      data: contactIds.map((contactId) => ({ listId: list.id, contactId })),
      skipDuplicates: true,
    });

    if (link.count > 0) {
      await prisma.contactList.update({
        where: { id: list.id },
        data: { contactCount: { increment: link.count } },
      });
      void reconcileCampaignsForList(list.id);
    }

    return sendData(res, { created, linked: link.count, totalRows: rows.length });
  } catch (error) {
    return next(error);
  }
});
