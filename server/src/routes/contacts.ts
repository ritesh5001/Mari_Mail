import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import type { FilterConfig } from "@marimail/types";
import { filterConfigToWhereClause, matchContactToVessel } from "@marimail/utils";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { contactDataFromRow, departmentsValue } from "../services/contact-data.js";
import { serializeContact } from "../services/serializers.js";
import { workspaceScope } from "../services/workspace-scope.js";
import { cacheJson } from "../services/cache.service.js";
import { getOrCreateMaribizSettings } from "../services/maribiz/settings.js";
import { searchPersons as maribizSearchPersons, getPerson as maribizGetPerson, MaribizError } from "../services/maribiz/client.js";
import { filterConfigToMaribizParams, maribizPersonToContactRow } from "../services/maribiz/mapper.js";
import { recordQuery as recordMaribizQuery, recordCacheHit as recordMaribizCacheHit } from "../services/maribiz/usage.js";
import { getOrCreateApolloSettings } from "../services/apollo/settings.js";
import {
  searchPersons as apolloSearchPersons,
  matchPerson as apolloMatchPerson,
  ApolloError,
} from "../services/apollo/client.js";
import { filterConfigToApolloParams, apolloPersonToContactRow } from "../services/apollo/mapper.js";
import {
  recordQuery as recordApolloQuery,
  recordCacheHit as recordApolloCacheHit,
  recordEmailReveal as recordApolloEmailReveal,
  recordPhoneReveal as recordApolloPhoneReveal,
} from "../services/apollo/usage.js";
import { deductCredits, grantCredits, CreditDeductionError } from "../services/billing.service.js";
import { getOrCreateDataSourceSettings } from "../services/data-sources/settings.js";
import { reconcileCampaignsForList } from "../services/campaign-list-reconciler.js";
import { createHash } from "node:crypto";

export const contactRouter = Router();

const filterConfigSchema = z.object({
  entityType: z.literal("CONTACT"),
  groupLogic: z.enum(["AND", "OR"]),
  groups: z.array(
    z.object({
      conditions: z.array(
        z.object({
          field: z.string(),
          operator: z.string(),
          value: z.unknown().optional(),
        }),
      ),
    }),
  ),
  sortBy: z
    .object({
      field: z.string(),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
}) satisfies z.ZodType<FilterConfig>;

const searchSchema = z.object({
  filterConfig: filterConfigSchema,
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  department: z.array(z.string()).optional(),
  marineRole: z
    .enum([
      "FLEET_MANAGER",
      "SHIP_SUPERINTENDENT",
      "TECHNICAL_MANAGER",
      "CREWING_MANAGER",
      "CHARTERING_MANAGER",
      "PORT_CAPTAIN",
      "MARINE_SURVEYOR",
      "CLASS_SURVEYOR",
      "UNDERWRITER",
      "BROKER",
      "PORT_AGENT",
      "CHANDLER",
      "BUNKER_TRADER",
      "OPA_PROVIDER",
      "OTHER",
    ])
    .optional(),
  seniority: z
    .enum(["INTERN", "ENTRY", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR", "VP", "C_LEVEL", "FOUNDER", "OWNER"])
    .optional(),
  emailStatus: z.enum(["VALID", "RISKY", "INVALID", "UNKNOWN"]).optional(),
  engagementScore: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
});

const sortableFields = new Set([
  "firstName",
  "lastName",
  "companyName",
  "email",
  "engagementScore",
  "createdAt",
  "updatedAt",
]);

function parseLimit(input: unknown) {
  const parsed = Number(input ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function orderByFor(filterConfig?: FilterConfig): Prisma.ContactOrderByWithRelationInput {
  const sort = filterConfig?.sortBy;
  if (!sort || !sortableFields.has(sort.field)) {
    return { engagementScore: "desc" };
  }
  return { [sort.field]: sort.direction };
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com", "example.com", "gmail.com", "googlemail.com", "hotmail.com",
  "icloud.com", "live.com", "mail.com", "msn.com", "outlook.com",
  "proton.me", "protonmail.com", "yahoo.com",
]);
const NOISE_DOMAINS = new Set([
  "-", "n/a", "na", "none", "null", "unknown", "tbd",
  "test.com", "example.com", "domain.com", "email.com",
]);
const MAX_VESSEL_DOMAINS = 20;

function extractDomainFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || NOISE_DOMAINS.has(raw.toLowerCase())) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase().replace(/\.$/, "");
    const domain = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return domain.includes(".") ? domain : null;
  } catch {
    return null;
  }
}

function extractDomainFromEmail(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^[^\s@]+@([^\s@,;<>]+)$/);
  if (!match) return null;
  const domain = match[1].replace(/[.,;]+$/, "");
  if (!domain.includes(".") || NOISE_DOMAINS.has(domain)) return null;
  return domain;
}

function splitEmailField(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
}

/**
 * Stricter version of collectDomainsFromVessel — only extracts domains from
 * the three primary companies (owner / ISM manager / commercial manager) and
 * their explicit email fields. Skips technical manager, P&I club, shipbuilder,
 * class society, engine builder, and operator emails, which typically point
 * to unrelated third-party organisations (surveyors, insurers, yards). Those
 * blew the "list-scope Apollo lookup" out to 20+ domains for a 4-vessel list.
 * Used only by /api/contacts/external-by-list; the per-vessel expansion still
 * uses the wider net.
 */
function collectPrimaryDomainsFromVessel(vessel: {
  commercialManagerEmail: string | null;
  registeredOwnerEmail: string | null;
  ismManagerEmail: string | null;
  shipOwnerCompany: { email: string | null; website: string | null } | null;
  ismManagerCompany: { email: string | null; website: string | null } | null;
  commercialManagerCompany: { email: string | null; website: string | null } | null;
}): string[] {
  const domains = new Set<string>();
  const companies = [vessel.shipOwnerCompany, vessel.ismManagerCompany, vessel.commercialManagerCompany];
  for (const company of companies) {
    const fromWebsite = extractDomainFromUrl(company?.website ?? null);
    if (fromWebsite && !PUBLIC_EMAIL_DOMAINS.has(fromWebsite)) domains.add(fromWebsite);
  }
  const emailFields: Array<string | null> = [
    vessel.commercialManagerEmail,
    vessel.registeredOwnerEmail,
    vessel.ismManagerEmail,
    ...companies.map((c) => c?.email ?? null),
  ];
  for (const field of emailFields) {
    for (const email of splitEmailField(field)) {
      const domain = extractDomainFromEmail(email);
      if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) domains.add(domain);
    }
  }
  return Array.from(domains);
}

function collectDomainsFromVessel(vessel: {
  commercialManagerEmail: string | null;
  registeredOwnerEmail: string | null;
  beneficialOwnerEmail: string | null;
  technicalManagerEmail: string | null;
  pAndIClubEmail: string | null;
  shipBuilderEmail: string | null;
  classSocietyEmail: string | null;
  engineBuilderEmail: string | null;
  ismManagerEmail: string | null;
  operatorEmail: string | null;
  shipOwnerCompany: { email: string | null; website: string | null } | null;
  ismManagerCompany: { email: string | null; website: string | null } | null;
  commercialManagerCompany: { email: string | null; website: string | null } | null;
}): string[] {
  const domains = new Set<string>();
  const companies = [vessel.shipOwnerCompany, vessel.ismManagerCompany, vessel.commercialManagerCompany];

  for (const company of companies) {
    const fromWebsite = extractDomainFromUrl(company?.website ?? null);
    if (fromWebsite && !PUBLIC_EMAIL_DOMAINS.has(fromWebsite)) domains.add(fromWebsite);
  }

  const emailFields: Array<string | null> = [
    vessel.commercialManagerEmail,
    vessel.registeredOwnerEmail,
    vessel.beneficialOwnerEmail,
    vessel.technicalManagerEmail,
    vessel.pAndIClubEmail,
    vessel.shipBuilderEmail,
    vessel.classSocietyEmail,
    vessel.engineBuilderEmail,
    vessel.ismManagerEmail,
    vessel.operatorEmail,
    ...companies.map((c) => c?.email ?? null),
  ];

  for (const field of emailFields) {
    for (const email of splitEmailField(field)) {
      const domain = extractDomainFromEmail(email);
      if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) domains.add(domain);
    }
  }

  return Array.from(domains).slice(0, MAX_VESSEL_DOMAINS);
}

function vesselWhereForCompanyLink(companyId: string | null, companyKind: string | null): Prisma.VesselWhereInput | null {
  if (!companyId) return null;
  if (companyKind === "SHIP_OWNER") return { shipOwnerCompanyId: companyId };
  if (companyKind === "ISM_MANAGER") return { ismManagerCompanyId: companyId };
  if (companyKind === "COMMERCIAL_MANAGER") return { commercialManagerCompanyId: companyId };
  return null;
}

async function findVesselsAssociatedToContactByDomain(
  contact: {
    id: string;
    email: string | null;
    secondaryEmail: string | null;
    website: string | null;
    companyName: string | null;
    companyId: string | null;
    companyKind: string | null;
  },
  workspaceId: string,
) {
  const companySelect = {
    id: true,
    companyName: true,
    email: true,
    website: true,
    country: true,
  } as const;
  const fallbackLink = vesselWhereForCompanyLink(contact.companyId, contact.companyKind);

  const vessels = await prisma.vessel.findMany({
    where: workspaceScope(workspaceId),
    include: {
      shipOwnerCompany: { select: companySelect },
      ismManagerCompany: { select: companySelect },
      commercialManagerCompany: { select: companySelect },
    },
    orderBy: { vesselName: "asc" },
  });

  return vessels.filter((vessel) => {
    if (matchContactToVessel(contact, vessel)) return true;
    if (!fallbackLink) return false;
    return (
      (contact.companyKind === "SHIP_OWNER" && vessel.shipOwnerCompanyId === contact.companyId) ||
      (contact.companyKind === "ISM_MANAGER" && vessel.ismManagerCompanyId === contact.companyId) ||
      (contact.companyKind === "COMMERCIAL_MANAGER" && vessel.commercialManagerCompanyId === contact.companyId)
    );
  });
}

contactRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const limit = parseLimit(req.query.limit);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Prisma.ContactWhereInput = {
      AND: [
        workspaceScope(workspaceId),
        q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { secondaryEmail: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
                { contactOwnerName: { contains: q, mode: "insensitive" } },
                { homePhone: { contains: q, mode: "insensitive" } },
                { mobilePhone: { contains: q, mode: "insensitive" } },
                { corporatePhone: { contains: q, mode: "insensitive" } },
                { otherPhone: { contains: q, mode: "insensitive" } },
                { personLinkedinUrl: { contains: q, mode: "insensitive" } },
                { website: { contains: q, mode: "insensitive" } },
                { companyLinkedinUrl: { contains: q, mode: "insensitive" } },
                { country: { contains: q, mode: "insensitive" } },
                { subsidiaryOf: { contains: q, mode: "insensitive" } },
                { salesforceId: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [contacts, count] = await Promise.all([
      prisma.contact.findMany({ where, orderBy: { engagementScore: "desc" }, take: limit }),
      prisma.contact.count({ where }),
    ]);

    return sendData(res, { contacts: contacts.map(serializeContact), count });
  } catch (error) {
    return next(error);
  }
});

contactRouter.post("/search", requireAuth, async (req, res, next) => {
  try {
    const input = searchSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId, workspaceId } = (req as AuthedRequest).auth;
    const translatedWhere = filterConfigToWhereClause(input.data.filterConfig) as Prisma.ContactWhereInput;

    // Regular users only see contacts they've personally curated — saved or
    // added to one of their own lists. Super-admins see the full workspace
    // pool. Avoids dumping 7k cold contacts on a brand-new user.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    const curatedClause: Prisma.ContactWhereInput =
      user?.isSuperAdmin
        ? {}
        : {
            OR: [
              { savedBy: { some: { userId } } },
              { listMemberships: { some: { list: { ownerId: userId } } } },
            ],
          };

    const where: Prisma.ContactWhereInput = {
      AND: [workspaceScope(workspaceId), curatedClause, translatedWhere],
    };

    const dsSettings = await getOrCreateDataSourceSettings();
    const internalEnabled = dsSettings.internalEnabled;

    const primaryPromise: Promise<[Awaited<ReturnType<typeof prisma.contact.findMany>>, number]> =
      internalEnabled
        ? Promise.all([
            prisma.contact.findMany({
              where,
              orderBy: orderByFor(input.data.filterConfig),
              take: input.data.limit + 1,
              ...(input.data.cursor ? { cursor: { id: input.data.cursor }, skip: 1 } : {}),
            }),
            prisma.contact.count({ where }),
          ])
        : Promise.resolve([[], 0] as [Awaited<ReturnType<typeof prisma.contact.findMany>>, number]);

    // Maribiz secondary DB: only contributes to first page (cursor === undefined).
    // Failures are isolated so primary results still ship.
    const isFirstPage = !input.data.cursor;
    const maribizPromise = isFirstPage
      ? (async () => {
          const settings = await getOrCreateMaribizSettings();
          if (!settings.enabled) return { rows: [], total: 0 };

          const params = filterConfigToMaribizParams(input.data.filterConfig, settings.maxResultsPerQuery);
          const cacheKey = `maribiz:search:${createHash("sha1")
            .update(JSON.stringify({ q: params.q ?? "", limit: params.limit }))
            .digest("hex")}`;

          let cacheHit = true;
          const result = await cacheJson(cacheKey, settings.cacheTtlSeconds, async () => {
            cacheHit = false;
            await recordMaribizQuery();
            return maribizSearchPersons(params);
          });
          if (cacheHit) await recordMaribizCacheHit();

          return {
            rows: result.rows.map(maribizPersonToContactRow),
            total: result.total.value,
          };
        })().catch((error) => {
          console.warn("[maribiz] search failed:", error instanceof MaribizError ? error.message : error);
          return null;
        })
      : Promise.resolve({ rows: [], total: 0 });

    const apolloPromise = isFirstPage
      ? (async () => {
          const settings = await getOrCreateApolloSettings();
          if (!settings.enabled || !settings.apiKey) return { rows: [], total: 0 };

          const params = filterConfigToApolloParams(input.data.filterConfig, settings.maxResultsPerQuery);
          const cacheKey = `apollo:search:${createHash("sha1")
            .update(JSON.stringify(params))
            .digest("hex")}`;

          let cacheHit = true;
          const result = await cacheJson(cacheKey, settings.cacheTtlSeconds, async () => {
            cacheHit = false;
            await recordApolloQuery();
            return apolloSearchPersons(params);
          });
          if (cacheHit) await recordApolloCacheHit();

          const rows = result.rows.map(apolloPersonToContactRow);

          // Persist Apollo previews (locked rows) so future searches can serve from DB.
          if (dsSettings.persistApolloSearchRows && !cacheHit && rows.length) {
            const apolloRows = result.rows;
            void Promise.allSettled(
              apolloRows.map(async (p, idx) => {
                const row = rows[idx];
                const existing = await prisma.contact.findFirst({
                  where: {
                    workspaceId,
                    source: "APOLLO",
                    customFields: { path: ["apolloId"], equals: p.id },
                  },
                  select: { id: true },
                });
                if (existing) return;
                await prisma.contact.create({
                  data: {
                    firstName: row.firstName || "Unknown",
                    lastName: row.lastName || "",
                    title: row.title,
                    companyName: row.companyName || "(unknown)",
                    email: `apollo-${p.id}@unknown.local`,
                    emailStatus: "UNKNOWN" as never,
                    personLinkedinUrl: row.personLinkedinUrl,
                    country: row.country,
                    seniority: row.seniority as never,
                    marineRole: "OTHER" as never,
                    workspaceId,
                    source: "APOLLO",
                    verified: false,
                    customFields: { apolloId: p.id, locked: true } as never,
                  },
                });
              }),
            ).catch((err) => console.warn("[apollo] persist failed:", err));
          }

          return { rows, total: result.total };
        })().catch((error) => {
          console.warn("[apollo] search failed:", error instanceof ApolloError ? error.message : error);
          return null;
        })
      : Promise.resolve({ rows: [], total: 0 });

    const [[contacts, count], maribiz, apollo] = await Promise.all([
      primaryPromise,
      maribizPromise,
      apolloPromise,
    ]);

    const page = contacts.slice(0, input.data.limit);
    const warnings: string[] = [];
    if (isFirstPage && maribiz === null) warnings.push("secondary_unavailable");
    if (isFirstPage && apollo === null) warnings.push("apollo_unavailable");
    if (!internalEnabled) warnings.push("internal_disabled");

    return sendData(res, {
      contacts: [
        ...page.map(serializeContact),
        ...(maribiz?.rows ?? []),
        ...(apollo?.rows ?? []),
      ],
      count,
      nextCursor: contacts.length > input.data.limit ? page.at(-1)?.id ?? null : null,
      maribizCount: maribiz?.total ?? 0,
      apolloCount: apollo?.total ?? 0,
      warnings,
    });
  } catch (error) {
    return next(error);
  }
});

// Apollo/Maribiz contacts for a vessel's owner/manager company domains.
// Returns *preview* rows only — Apollo emails/phones stay locked; the caller
// spends credits explicitly via /reveal-apollo/:externalId/:field. So this
// endpoint itself never deducts a credit.
contactRouter.get("/external-by-vessel/:vesselId", requireAuth, async (req, res, next) => {
  try {
    // Vessel lookup is intentionally unscoped: Port Radar now displays
    // globally-visible ETAs that can reference vessels from any workspace,
    // and this endpoint only reads public owner/manager email fields to
    // extract company domains for Apollo. Denying access here would break
    // the "expand row → find contacts" flow for every cross-workspace vessel.
    const vessel = await prisma.vessel.findUnique({
      where: { id: req.params.vesselId },
      select: {
        id: true,
        commercialManagerEmail: true,
        registeredOwnerEmail: true,
        beneficialOwnerEmail: true,
        technicalManagerEmail: true,
        pAndIClubEmail: true,
        shipBuilderEmail: true,
        classSocietyEmail: true,
        engineBuilderEmail: true,
        ismManagerEmail: true,
        operatorEmail: true,
        shipOwnerCompany: { select: { email: true, website: true } },
        ismManagerCompany: { select: { email: true, website: true } },
        commercialManagerCompany: { select: { email: true, website: true } },
      },
    });

    if (!vessel) {
      return sendError(res, 404, "VESSEL_NOT_FOUND", "Vessel not found");
    }

    const domains = collectDomainsFromVessel(vessel);
    if (!domains.length) {
      return sendData(res, { rows: [], warnings: ["no_domains"] });
    }

    const warnings: string[] = [];

    const apolloResult = await (async () => {
      const settings = await getOrCreateApolloSettings();
      if (!settings.enabled || !settings.apiKey) return { rows: [] };
      try {
        const cacheKey = `apollo:by-vessel:${createHash("sha1")
          .update(JSON.stringify({ domains }))
          .digest("hex")}`;
        let cacheHit = true;
        const result = await cacheJson(cacheKey, settings.cacheTtlSeconds, async () => {
          cacheHit = false;
          await recordApolloQuery();
          return apolloSearchPersons({
            q_organization_domains_list: domains,
            per_page: Math.min(settings.maxResultsPerQuery, 50),
            page: 1,
          });
        });
        if (cacheHit) await recordApolloCacheHit();
        return { rows: result.rows.map(apolloPersonToContactRow) };
      } catch (error) {
        console.warn("[apollo] external-by-vessel failed:", error instanceof ApolloError ? error.message : error);
        warnings.push("apollo_unavailable");
        return { rows: [] };
      }
    })();

    const maribizResult = await (async () => {
      const settings = await getOrCreateMaribizSettings();
      if (!settings.enabled) return { rows: [] };
      try {
        const cacheKey = `maribiz:by-vessel:${createHash("sha1")
          .update(JSON.stringify({ domain: domains[0] }))
          .digest("hex")}`;
        let cacheHit = true;
        const result = await cacheJson(cacheKey, settings.cacheTtlSeconds, async () => {
          cacheHit = false;
          await recordMaribizQuery();
          return maribizSearchPersons({ q: domains[0], limit: Math.min(settings.maxResultsPerQuery, 50) });
        });
        if (cacheHit) await recordMaribizCacheHit();
        return { rows: result.rows.map(maribizPersonToContactRow) };
      } catch (error) {
        console.warn("[maribiz] external-by-vessel failed:", error instanceof MaribizError ? error.message : error);
        warnings.push("secondary_unavailable");
        return { rows: [] };
      }
    })();

    const seen = new Set<string>();
    const rows: unknown[] = [];
    for (const row of [...apolloResult.rows, ...maribizResult.rows]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      if (rows.length >= 50) break;
    }

    return sendData(res, { rows, warnings });
  } catch (error) {
    return next(error);
  }
});

/**
 * Aggregates Apollo contacts across every vessel in a list. Powers the
 * "Campaign by Role" panel on a list detail page — rather than showing 15
 * hard-coded marine role chips (many with zero contacts), we show the real
 * titles Apollo returned for the list's vessel company domains. Response
 * shape is designed for two consumption modes on the same URL:
 *
 *   GET .../external-by-list/:listId
 *     → { rows: [locked apollo rows], titleHistogram: [...], warnings }
 *
 *   GET .../external-by-list/:listId?title=Fleet%20Manager&title=Broker
 *     → same shape but rows filtered to the selected titles
 */
contactRouter.get("/external-by-list/:listId", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: req.params.listId, ...workspaceScope(workspaceId), ownerId: userId },
      select: { id: true },
    });
    if (!list) return sendError(res, 404, "NOT_FOUND", "List not found");

    // Unscoped vessel lookup: list ownership is already gated above, and after
    // the global-ETA change vessels legitimately cross workspaces.
    // Optional ?vesselId=… (repeatable) narrows the search to a subset of the
    // list's vessels — the New Vessels tab passes only the vessels that have no
    // contacts yet, so its results and title suggestions cover just those ships
    // instead of every vessel on the list.
    const vesselIdFilter = ([] as string[])
      .concat((req.query.vesselId as string | string[] | undefined) ?? [])
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => value.trim())
      .filter(Boolean);

    // Full rows (not a narrow select): the domain collection below only needs
    // the email/website columns, but matchContactToVessel — used to tell each
    // result row which vessel it belongs to — reads the whole company records.
    const vessels = await prisma.vessel.findMany({
      where: {
        listMemberships: { some: { listId: list.id } },
        ...(vesselIdFilter.length > 0 ? { id: { in: vesselIdFilter } } : {}),
      },
      include: {
        shipOwnerCompany: true,
        ismManagerCompany: true,
        commercialManagerCompany: true,
      },
    });

    if (vessels.length === 0) {
      return sendData(res, { rows: [], titleHistogram: [], warnings: ["no_vessels"] });
    }

    // Union PRIMARY vessel domains only (owner / ISM / commercial manager).
    // The wider net that includes technical manager / class society / P&I
    // club / builders was surfacing dozens of unrelated third-party domains
    // for a handful of vessels.
    //
    // Keep the reverse index too: Apollo is queried with every vessel's domains
    // at once, so a result on its own says nothing about which ship it came
    // from. Mapping domain → vessels is what lets each row name its vessel.
    const domainSet = new Set<string>();
    const vesselsByDomain = new Map<string, typeof vessels>();
    for (const v of vessels) {
      for (const d of collectPrimaryDomainsFromVessel(v)) {
        domainSet.add(d);
        const bucket = vesselsByDomain.get(d) ?? [];
        bucket.push(v);
        vesselsByDomain.set(d, bucket);
      }
    }
    const domains = Array.from(domainSet).slice(0, 50);

    if (!domains.length) {
      return sendData(res, { rows: [], titleHistogram: [], warnings: ["no_domains"] });
    }

    // Pagination. Apollo search is free (only reveal spends credits), so
    // "Load more" simply pulls the next Apollo page. Client aggregates across
    // pages; server returns the raw page + nextPage marker for control.
    const requestedPage = Math.max(1, Math.min(20, Number(req.query.page ?? 1) || 1));

    // Title filters — three shapes supported so the picker can stay compact
    // for the "one-off search" case while still driving Apollo's full
    // include/exclude/seniority filter surface for the Apollo-style panel.
    //
    //   ?q=broker                       → single fuzzy title (legacy)
    //   ?includeTitle=broker&includeTitle=fleet+manager  → multi-title include
    //   ?excludeTitle=intern                             → titles to skip
    //   ?seniority=director&seniority=vp                 → Apollo seniority buckets
    const rawQ = req.query.q;
    const q = typeof rawQ === "string" ? rawQ.trim() : "";
    const readList = (raw: unknown): string[] =>
      ([] as string[])
        .concat((raw as string | string[] | undefined) ?? [])
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .map((s) => s.trim())
        .filter(Boolean);
    const includeTitles = readList(req.query.includeTitle);
    const excludeTitles = readList(req.query.excludeTitle);
    const seniorities = readList(req.query.seniority);
    const personTitles = includeTitles.length > 0 ? includeTitles : q ? [q] : undefined;
    const personNotTitles = excludeTitles.length > 0 ? excludeTitles : undefined;
    const personSeniorities = seniorities.length > 0 ? seniorities : undefined;

    const warnings: string[] = [];
    let apolloRows: ReturnType<typeof apolloPersonToContactRow>[] = [];
    let apolloNextPage: number | null = null;
    // person id → vessels, built from which domain's search returned them.
    let vesselIdsByPersonId = new Map<string, Set<string>>();

    {
      const settings = await getOrCreateApolloSettings();
      if (!settings.enabled || !settings.apiKey) {
        warnings.push("apollo_disabled");
      } else {
        try {
          // One search PER DOMAIN rather than all domains at once.
          //
          // Apollo's search response carries only `organization.name` — no
          // primary_domain, no org id (verified against the live API). Querying
          // every domain together therefore makes rows unattributable: Apollo
          // freely returns corporate-group relatives (vgrouplimited.com yields
          // "V.Group" people, nykline.co.jp yields "NYK Line (India) Ltd"), and
          // nothing in the payload says which domain produced which person.
          //
          // Searching one domain at a time makes the origin unambiguous: every
          // row from a domain's page belongs to that domain's vessels, whatever
          // the org name says. Search costs no credits — only reveals do — so
          // the extra calls are just latency, and each is cached separately.
          const perDomain = await Promise.all(
            domains.map(async (domain) => {
              const cacheKey = `apollo:by-domain:${createHash("sha1")
                .update(
                  JSON.stringify({
                    domain,
                    page: requestedPage,
                    q,
                    includeTitles,
                    excludeTitles,
                    seniorities,
                  }),
                )
                .digest("hex")}`;
              let cacheHit = true;
              try {
                const result = await cacheJson(cacheKey, settings.cacheTtlSeconds, async () => {
                  cacheHit = false;
                  await recordApolloQuery();
                  return apolloSearchPersons({
                    q_organization_domains_list: [domain],
                    person_titles: personTitles,
                    person_not_titles: personNotTitles,
                    person_seniorities: personSeniorities,
                    per_page: 100,
                    page: requestedPage,
                  });
                });
                if (cacheHit) await recordApolloCacheHit();
                return { domain, result };
              } catch (error) {
                console.warn(
                  `[apollo] external-by-list domain=${domain} failed:`,
                  error instanceof ApolloError ? error.message : error,
                );
                return null;
              }
            }),
          );

          const failed = perDomain.filter((entry) => entry === null).length;
          if (failed > 0 && failed === domains.length) warnings.push("apollo_unavailable");

          // Dedupe across domains — a person can sit at a company that serves
          // several vessels — unioning their vessels rather than repeating them.
          const byPerson = new Map<
            string,
            { row: ReturnType<typeof apolloPersonToContactRow>; vesselIds: Set<string> }
          >();
          for (const entry of perDomain) {
            if (!entry) continue;
            const vesselsForDomain = vesselsByDomain.get(entry.domain) ?? [];
            for (const person of entry.result.rows) {
              const row = apolloPersonToContactRow(person);
              const existing = byPerson.get(row.id);
              const target = existing ?? { row, vesselIds: new Set<string>() };
              for (const vessel of vesselsForDomain) target.vesselIds.add(vessel.id);
              byPerson.set(row.id, target);
            }
          }

          apolloRows = Array.from(byPerson.values()).map((entry) => entry.row);
          vesselIdsByPersonId = new Map(
            Array.from(byPerson.entries()).map(([id, entry]) => [id, entry.vesselIds]),
          );
          // Any domain with another page means there's more to load.
          apolloNextPage = perDomain.reduce<number | null>(
            (next, entry) => next ?? entry?.result.nextPage ?? null,
            null,
          );
        } catch (error) {
          console.warn("[apollo] external-by-list failed:", error instanceof ApolloError ? error.message : error);
          warnings.push("apollo_unavailable");
        }
      }
    }

    // Group real Apollo titles → histogram. We use the raw title verbatim so
    // the picker matches what Apollo actually returns (no lossy normalisation).
    const titleCounts = new Map<string, number>();
    for (const row of apolloRows) {
      const t = row.title?.trim();
      if (!t) continue;
      titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    }
    const titleHistogram = Array.from(titleCounts.entries())
      .map(([title, count]) => ({ title, count }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

    // Optional filter by ?title=… (repeatable)
    const requestedTitlesRaw = ([] as string[])
      .concat(req.query.title as string | string[] | undefined ?? [])
      .flatMap((val) => (Array.isArray(val) ? val : [val]));
    const requestedTitles = new Set(requestedTitlesRaw.filter(Boolean));

    const filteredRows = requestedTitles.size > 0
      ? apolloRows.filter((row) => row.title && requestedTitles.has(row.title))
      : apolloRows;

    // Every row's vessels are already known from the domain whose search
    // returned it (see the per-domain loop above), so this is just a lookup.
    // The name-based matcher is kept as a backstop for a person who somehow
    // arrives without a domain attribution.
    const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
    const toVesselView = (vessel: (typeof vessels)[number]) => ({
      id: vessel.id,
      vesselName: vessel.vesselName,
      imoNumber: vessel.imoNumber,
    });
    const rowsWithVessels = filteredRows.map((row) => {
      const fromDomain = vesselIdsByPersonId.get(row.id);
      if (fromDomain && fromDomain.size > 0) {
        return {
          ...row,
          matchedVessels: Array.from(fromDomain)
            .map((id) => vesselById.get(id))
            .filter((vessel): vessel is (typeof vessels)[number] => Boolean(vessel))
            .map(toVesselView),
        };
      }

      if (!row.companyName) return { ...row, matchedVessels: [] };
      const probe = {
        id: String(row.externalId ?? ""),
        email: null,
        secondaryEmail: null,
        website: [row.website, row.companyDomain].filter(Boolean).join(", ") || null,
        companyName: row.companyName,
      };
      return {
        ...row,
        matchedVessels: vessels
          .filter((vessel) => matchContactToVessel(probe, vessel) !== null)
          .map(toVesselView),
      };
    });

    return sendData(res, {
      rows: rowsWithVessels,
      titleHistogram,
      totalContacts: apolloRows.length,
      totalDomains: domains.length,
      page: requestedPage,
      nextPage: apolloNextPage,
      warnings,
    });
  } catch (error) {
    return next(error);
  }
});

contactRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, ...workspaceScope(workspaceId) },
    });

    if (!contact) {
      return sendError(res, 404, "CONTACT_NOT_FOUND", "Contact not found");
    }

    const vessels = await findVesselsAssociatedToContactByDomain(contact, workspaceId);

    return sendData(res, {
      contact: serializeContact(contact),
      vessels: vessels.map((vessel) => ({
        id: vessel.id,
        imoNumber: vessel.imoNumber,
        vesselName: vessel.vesselName,
        vesselType: vessel.vesselType,
        dwt: vessel.dwt,
        flag: vessel.flag,
        capacityDwt: vessel.capacityDwt,
        currentPortUnlocode: vessel.currentPortUnlocode,
        commercialManagerName: vessel.commercialManagerName,
        ismManagerName: vessel.ismManagerName,
        operatorName: vessel.operatorName,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

contactRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const input = updateSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, ...workspaceScope(workspaceId) },
      select: { id: true },
    });

    if (!existing) {
      return sendError(res, 404, "CONTACT_NOT_FOUND", "Contact not found");
    }

    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: input.data,
    });

    const smartLists = await prisma.contactList.findMany({
      where: { workspaceId, type: "SMART", isArchived: false, filterConfig: { not: Prisma.JsonNull } },
    });

    for (const list of smartLists) {
      const count = await prisma.contact.count({
        where: {
          AND: [
            workspaceScope(workspaceId),
            filterConfigToWhereClause(list.filterConfig as unknown as FilterConfig) as Prisma.ContactWhereInput,
          ],
        },
      });
      await prisma.contactList.update({ where: { id: list.id }, data: { contactCount: count } });
    }

    return sendData(res, serializeContact(contact));
  } catch (error) {
    return next(error);
  }
});

// ── Manual create contact ─────────────────────────────────────────────────────

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().email().optional(),
);
const optionalDepartments = z.preprocess(
  (value) => {
    if (Array.isArray(value)) return departmentsValue(value.filter((item): item is string => typeof item === "string"));
    if (typeof value === "string") return departmentsValue(value);
    return [];
  },
  z.array(z.string()).default([]),
);

const createContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  companyName: z.string().min(1),
  title: optionalText,
  department: optionalDepartments,
  contactOwnerName: optionalText,
  homePhone: optionalText,
  mobilePhone: optionalText,
  corporatePhone: optionalText,
  otherPhone: optionalText,
  personLinkedinUrl: optionalText,
  website: optionalText,
  companyLinkedinUrl: optionalText,
  country: optionalText,
  subsidiaryOf: optionalText,
  secondaryEmail: optionalEmail,
  salesforceId: optionalText,
  marineRole: z.enum(["FLEET_MANAGER","SHIP_SUPERINTENDENT","TECHNICAL_MANAGER","CREWING_MANAGER","CHARTERING_MANAGER","PORT_CAPTAIN","MARINE_SURVEYOR","CLASS_SURVEYOR","UNDERWRITER","BROKER","PORT_AGENT","CHANDLER","BUNKER_TRADER","OPA_PROVIDER","OTHER"]).default("OTHER"),
  seniority: z.enum(["INTERN","ENTRY","MID","SENIOR","LEAD","MANAGER","DIRECTOR","VP","C_LEVEL","FOUNDER","OWNER"]).default("MID"),
  tags: z.array(z.string()).default([]),
});

function normalizeCreateContactBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const row: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) {
      row[key] = Array.isArray(value) ? value.join(";") : String(value);
    }
  }

  return {
    ...contactDataFromRow(row),
    ...body,
  };
}

contactRouter.post("/import-maribiz/:externalId", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;

    const settings = await getOrCreateMaribizSettings();
    if (!settings.enabled) {
      return sendError(res, 403, "MARIBIZ_DISABLED", "Secondary database is disabled");
    }

    let person;
    try {
      person = await maribizGetPerson(req.params.externalId);
    } catch (error) {
      const message = error instanceof MaribizError ? error.message : (error as Error).message;
      return sendError(res, 502, "MARIBIZ_UNAVAILABLE", message);
    }

    if (!person.person_email) {
      return sendError(res, 422, "NO_EMAIL", "Maribiz person has no email; cannot import");
    }

    const email = person.person_email.toLowerCase();
    const row = maribizPersonToContactRow(person);

    const existing = await prisma.contact.findFirst({
      where: { email, workspaceId },
      select: { id: true },
    });
    if (existing) {
      const contact = await prisma.contact.findUnique({ where: { id: existing.id } });
      return sendData(res, { contact: contact ? serializeContact(contact) : null, created: false });
    }

    const contact = await prisma.contact.create({
      data: {
        firstName: row.firstName || "Unknown",
        lastName: row.lastName || "",
        title: row.title,
        companyName: row.companyName || "(unknown)",
        email,
        mobilePhone: row.mobilePhone,
        personLinkedinUrl: row.personLinkedinUrl,
        country: row.country,
        seniority: row.seniority as never,
        marineRole: "OTHER",
        emailStatus: row.emailStatus as never,
        workspaceId,
        source: "MARIBIZ",
        verified: false,
      },
    });

    return sendData(res, { contact: serializeContact(contact), created: true }, 201);
  } catch (error) {
    return next(error);
  }
});

type RevealField = "email" | "phone";

// Upsert the workspace-scoped Contact from the platform-level cache row.
// Called from both the cache-hit path (no Apollo call) and cache-miss path
// (after Apollo succeeded and the cache was populated).
async function upsertWorkspaceContactFromCache(
  cache: {
    apolloId: string;
    firstName: string;
    lastName: string;
    title: string | null;
    companyName: string;
    email: string | null;
    emailStatus: string | null;
    mobilePhone: string | null;
    personLinkedinUrl: string | null;
    country: string | null;
    seniority: string;
  },
  workspaceId: string,
) {
  const existing = await prisma.contact.findFirst({
    where: {
      workspaceId,
      source: "APOLLO",
      customFields: { path: ["apolloId"], equals: cache.apolloId },
    },
  });
  const wasLocked = existing?.email?.endsWith("@unknown.local") ?? true;

  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...(cache.email
            ? { email: cache.email, emailStatus: "VALID" as never, verified: true }
            : {}),
          ...(cache.mobilePhone ? { mobilePhone: cache.mobilePhone } : {}),
          firstName: cache.firstName || existing.firstName,
          lastName: cache.lastName || existing.lastName,
          title: cache.title ?? existing.title,
          companyName: cache.companyName || existing.companyName,
          personLinkedinUrl: cache.personLinkedinUrl ?? existing.personLinkedinUrl,
          country: cache.country ?? existing.country,
        },
      })
    : await prisma.contact.create({
        data: {
          firstName: cache.firstName || "Unknown",
          lastName: cache.lastName || "",
          title: cache.title,
          companyName: cache.companyName || "(unknown)",
          personLinkedinUrl: cache.personLinkedinUrl,
          country: cache.country,
          seniority: cache.seniority as never,
          marineRole: "OTHER" as const,
          workspaceId,
          source: "APOLLO" as const,
          email: cache.email ?? `apollo-${cache.apolloId}@unknown.local`,
          emailStatus: (cache.email ? "VALID" : "UNKNOWN") as never,
          mobilePhone: cache.mobilePhone,
          verified: Boolean(cache.email),
          customFields: { apolloId: cache.apolloId } as never,
        },
      });

  return { contact, wasLocked };
}

async function reconcileListsForRevealedContact(contactId: string) {
  try {
    const memberships = await prisma.listContact.findMany({
      where: { contactId },
      select: { listId: true },
    });
    const unique = Array.from(new Set(memberships.map((m) => m.listId)));
    for (const listId of unique) {
      await reconcileCampaignsForList(listId);
    }
  } catch (err) {
    console.warn(`[reveal-apollo] post-reveal reconcile failed contact=${contactId}: ${(err as Error).message}`);
  }
}

async function revealApolloPerson(
  field: RevealField,
  externalId: string,
  workspaceId: string,
  userId: string | null,
) {
  const settings = await getOrCreateApolloSettings();
  if (!settings.enabled || !settings.apiKey) {
    return { status: 403 as const, code: "APOLLO_DISABLED", message: "Apollo integration is disabled" };
  }

  const price =
    field === "email" ? settings.creditsPerEmailReveal : settings.creditsPerPhoneReveal;
  const reason = field === "email" ? "REVEAL_EMAIL" : "REVEAL_PHONE";

  // Cross-workspace cache: if any workspace has already paid Apollo for this
  // person's email/phone, serve the cached value. The user is still charged 1
  // platform credit; Apollo is not billed again.
  const cached = await prisma.apolloRevealCache.findUnique({
    where: { apolloId: externalId },
  });
  const cachedFieldPresent =
    cached !== null && (field === "email" ? Boolean(cached.email) : Boolean(cached.mobilePhone));

  if (cached && cachedFieldPresent) {
    let balance: number;
    try {
      balance = await deductCredits(
        workspaceId,
        price,
        reason,
        `apollo:${externalId}:cached`,
        userId,
      );
    } catch (error) {
      if (error instanceof CreditDeductionError) {
        return {
          status: 402 as const,
          code: "INSUFFICIENT_CREDITS",
          message: error.message,
          required: error.required,
          available: error.available,
        };
      }
      throw error;
    }

    await prisma.apolloRevealCache
      .update({ where: { id: cached.id }, data: { reuseCount: { increment: 1 } } })
      .catch(() => undefined);

    const { contact, wasLocked } = await upsertWorkspaceContactFromCache(
      {
        apolloId: cached.apolloId,
        firstName: cached.firstName,
        lastName: cached.lastName,
        title: cached.title,
        companyName: cached.companyName,
        email: cached.email,
        emailStatus: cached.emailStatus,
        mobilePhone: cached.mobilePhone,
        personLinkedinUrl: cached.personLinkedinUrl,
        country: cached.country,
        seniority: cached.seniority,
      },
      workspaceId,
    );

    if (field === "email" && cached.email && wasLocked) {
      void reconcileListsForRevealedContact(contact.id);
    }

    return {
      status: 200 as const,
      contact: serializeContact(contact),
      balance,
    };
  }

  // Cache miss for the requested field — pay Apollo.
  let balance: number;
  try {
    balance = await deductCredits(workspaceId, price, reason, `apollo:${externalId}`, userId);
  } catch (error) {
    if (error instanceof CreditDeductionError) {
      return {
        status: 402 as const,
        code: "INSUFFICIENT_CREDITS",
        message: error.message,
        required: error.required,
        available: error.available,
      };
    }
    throw error;
  }

  let person;
  try {
    person = await apolloMatchPerson(externalId, {
      reveal_personal_emails: field === "email",
      reveal_phone_number: field === "phone",
    });
  } catch (error) {
    // Refund on failure
    await grantCredits(workspaceId, price, "REFUND", `apollo:${externalId}:${field}:failed`, userId).catch(
      (refundErr) => {
        console.error("[apollo] refund failed:", refundErr);
      },
    );
    const message = error instanceof ApolloError ? error.message : (error as Error).message;
    return { status: 502 as const, code: "APOLLO_UNAVAILABLE", message };
  }

  if (field === "email") {
    await recordApolloEmailReveal();
  } else {
    await recordApolloPhoneReveal();
  }

  const row = apolloPersonToContactRow(person);
  const realEmail =
    field === "email" && person.email && !row.emailLocked ? person.email.toLowerCase() : null;
  const realPhone =
    field === "phone"
      ? person.phone_numbers?.[0]?.sanitized_number ?? person.phone_numbers?.[0]?.raw_number ?? null
      : null;

  if (field === "email" && !realEmail) {
    await grantCredits(workspaceId, price, "REFUND", `apollo:${externalId}:email:no-data`, userId).catch(
      () => undefined,
    );
    return {
      status: 422 as const,
      code: "NO_EMAIL",
      message: "Apollo has no email on file for this contact — you were not charged.",
    };
  }
  if (field === "phone" && !realPhone) {
    await grantCredits(workspaceId, price, "REFUND", `apollo:${externalId}:phone:no-data`, userId).catch(
      () => undefined,
    );
    return {
      status: 422 as const,
      code: "NO_PHONE",
      message: "Apollo has no phone on file for this contact — you were not charged.",
    };
  }

  const now = new Date();
  const upsertedCache = await prisma.apolloRevealCache
    .upsert({
      where: { apolloId: externalId },
      create: {
        apolloId: externalId,
        firstName: row.firstName || "Unknown",
        lastName: row.lastName || "",
        fullName: row.fullName ?? null,
        title: row.title,
        companyName: row.companyName || "(unknown)",
        companyDomain: person.organization?.primary_domain ?? null,
        companyLinkedinUrl: row.companyLinkedinUrl,
        companyWebsite: row.website,
        email: realEmail,
        emailStatus: realEmail ? "VALID" : null,
        mobilePhone: realPhone,
        personLinkedinUrl: row.personLinkedinUrl,
        country: row.country,
        seniority: row.seniority as never,
        rawApolloData: person as never,
        emailRevealedAt: realEmail ? now : null,
        phoneRevealedAt: realPhone ? now : null,
        firstRevealedWorkspaceId: workspaceId,
        firstRevealedUserId: userId,
      },
      update: {
        ...(realEmail
          ? { email: realEmail, emailStatus: "VALID", emailRevealedAt: now }
          : {}),
        ...(realPhone ? { mobilePhone: realPhone, phoneRevealedAt: now } : {}),
        // Refresh org-domain fields too: rows backfilled by the migration have
        // these NULL, and they power contact↔vessel association enrichment.
        companyDomain: person.organization?.primary_domain ?? undefined,
        companyWebsite: row.website ?? undefined,
        rawApolloData: person as never,
      },
    })
    .catch((err) => {
      console.warn("[apollo] reveal-cache upsert failed:", err);
      return null;
    });

  const { contact, wasLocked } = await upsertWorkspaceContactFromCache(
    {
      apolloId: externalId,
      firstName: upsertedCache?.firstName ?? row.firstName ?? "Unknown",
      lastName: upsertedCache?.lastName ?? row.lastName ?? "",
      title: upsertedCache?.title ?? row.title ?? null,
      companyName: upsertedCache?.companyName ?? row.companyName ?? "(unknown)",
      email: upsertedCache?.email ?? realEmail,
      emailStatus: upsertedCache?.emailStatus ?? (realEmail ? "VALID" : null),
      mobilePhone: upsertedCache?.mobilePhone ?? realPhone,
      personLinkedinUrl: upsertedCache?.personLinkedinUrl ?? row.personLinkedinUrl,
      country: upsertedCache?.country ?? row.country,
      seniority: upsertedCache?.seniority ?? row.seniority,
    },
    workspaceId,
  );

  // If the email transitioned from locked (apollo-*@unknown.local) → real,
  // the campaign resolver — which filters out @unknown.local — will now
  // return this contact. Re-run the reconciler for every list this contact
  // sits on so any ACTIVE campaign targeting that list picks them up and
  // schedules Step 1 automatically. Without this, the contact stays visible
  // as "TARGET" but never enrols until the user re-launches.
  if (field === "email" && realEmail && wasLocked) {
    void reconcileListsForRevealedContact(contact.id);
  }

  return {
    status: 200 as const,
    contact: serializeContact(contact),
    balance,
  };
}

contactRouter.post("/reveal-apollo/:externalId/email", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const result = await revealApolloPerson("email", req.params.externalId, workspaceId, userId);
    if (result.status === 200) return sendData(res, { contact: result.contact, balance: result.balance });
    return sendError(res, result.status, result.code, result.message);
  } catch (error) {
    return next(error);
  }
});

contactRouter.post("/reveal-apollo/:externalId/phone", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const result = await revealApolloPerson("phone", req.params.externalId, workspaceId, userId);
    if (result.status === 200) return sendData(res, { contact: result.contact, balance: result.balance });
    return sendError(res, result.status, result.code, result.message);
  } catch (error) {
    return next(error);
  }
});

contactRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createContactSchema.safeParse(normalizeCreateContactBody(req.body));
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    const { workspaceId } = (req as AuthedRequest).auth;

    const contact = await prisma.contact.create({
      data: {
        ...input.data,
        email: input.data.email.toLowerCase(),
        secondaryEmail: input.data.secondaryEmail?.toLowerCase(),
        marineRole: input.data.marineRole as never,
        seniority: input.data.seniority as never,
        workspaceId,
        source: "MANUAL",
        emailStatus: "UNKNOWN",
      },
    });

    return sendData(res, serializeContact(contact as never), 201);
  } catch (error) {
    return next(error);
  }
});
