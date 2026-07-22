import { Prisma } from "@marimail/db";
import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { filterConfigToWhereClause } from "@marimail/utils";
import type { FilterConfig } from "@marimail/types";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { ensureDestinationPort, normalizePortValue } from "../services/port-resolution.js";
import { workspaceScope, workspaceStrictScope } from "../services/workspace-scope.js";
import {
  createETATriggers,
  matchCampaignsToETA,
  recomputeETATriggerTimes,
} from "../services/campaign-matcher.js";
import { rescheduleEtaTrigger, scheduleEtaTrigger } from "../services/campaign-scheduler.js";
import { emitWorkspaceEvent } from "../services/realtime.js";

export const vesselEtaRouter = Router();

const filterConfigSchema = z.object({
  entityType: z.literal("ETA"),
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
    .object({ field: z.string(), direction: z.enum(["asc", "desc"]) })
    .optional(),
}) satisfies z.ZodType<FilterConfig>;

const createSchema = z.object({
  imoNumber: z.string().min(7).max(7).optional(),
  vesselId: z.string().optional(),
  destinationPort: z.string().min(2),
  destinationPortName: z.string().optional(),
  eta: z.string().min(1),
  etaSource: z.enum(["AIS_AUTO", "MANUAL_ENTRY", "CSV_IMPORT", "API_FEED"]).default("MANUAL_ENTRY"),
  etaConfidence: z.enum(["CONFIRMED", "ESTIMATED", "TENTATIVE"]).default("ESTIMATED"),
  voyageStatus: z.enum(["AT_SEA", "AT_ANCHOR", "IN_PORT", "DRIFTING", "UNKNOWN"]).default("AT_SEA"),
  previousPort: z.string().nullable().optional(),
  previousCargo: z.string().nullable().optional(),
  nextCargo: z.string().nullable().optional(),
  currentLat: z.number().nullable().optional(),
  currentLon: z.number().nullable().optional(),
  currentPort: z.string().nullable().optional(),
  speedOverGround: z.number().nullable().optional(),
  enrollCampaignIds: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  destinationPort: z.string().min(2).optional(),
  destinationPortName: z.string().optional(),
  eta: z.string().optional(),
  etaSource: z.enum(["AIS_AUTO", "MANUAL_ENTRY", "CSV_IMPORT", "API_FEED"]).optional(),
  etaConfidence: z.enum(["CONFIRMED", "ESTIMATED", "TENTATIVE"]).optional(),
  voyageStatus: z.enum(["AT_SEA", "AT_ANCHOR", "IN_PORT", "DRIFTING", "UNKNOWN"]).optional(),
  previousPort: z.string().nullable().optional(),
  previousCargo: z.string().nullable().optional(),
  nextCargo: z.string().nullable().optional(),
  currentLat: z.number().nullable().optional(),
  currentLon: z.number().nullable().optional(),
  currentPort: z.string().nullable().optional(),
  speedOverGround: z.number().nullable().optional(),
});

const searchSchema = z.object({
  filterConfig: filterConfigSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

async function resolveVesselId(
  workspaceId: string,
  input: { imoNumber?: string; vesselId?: string },
  options: { includeGlobal?: boolean } = {},
) {
  // Super-admin flows can also link to global (workspaceId=null) vessels so a
  // global ETA can be created against a shared vessel.
  const workspaceClause = options.includeGlobal
    ? { OR: [{ workspaceId }, { workspaceId: null }] }
    : { workspaceId };
  if (input.vesselId) {
    const vessel = await prisma.vessel.findFirst({ where: { id: input.vesselId, ...workspaceClause } });
    return vessel?.id ?? null;
  }
  if (input.imoNumber) {
    const vessel = await prisma.vessel.findFirst({ where: { imoNumber: input.imoNumber, ...workspaceClause } });
    return vessel?.id ?? null;
  }
  return null;
}

async function isActorSuperAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  return Boolean(user?.isSuperAdmin);
}

async function resolvePortName(portCode: string, fallback?: string) {
  const port = await prisma.port.findUnique({ where: { portCode }, select: { portName: true } });
  return port?.portName ?? fallback ?? portCode;
}

vesselEtaRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    // ETAs are global — every workspace sees the same voyage schedule for a
    // given vessel. The admin/regular distinction is preserved only for the
    // vessel-lookup path below (admins can reach global vessels by design).
    const isAdmin = await isActorSuperAdmin(userId);
    const vesselId = await resolveVesselId(workspaceId, input.data, { includeGlobal: isAdmin });
    if (!vesselId) {
      return sendError(res, 404, "NOT_FOUND", isAdmin ? "Vessel not found" : "Vessel not found in this workspace");
    }

    const destinationPortName = await resolvePortName(input.data.destinationPort.toUpperCase(), input.data.destinationPortName);

    const parsedEta = parseFlexibleEta(input.data.eta);
    if (!parsedEta) {
      return sendError(res, 400, "VALIDATION_ERROR", `Invalid ETA timestamp: ${input.data.eta}`);
    }
    const eta = await prisma.vesselETA.create({
      data: {
        vesselId,
        destinationPort: input.data.destinationPort.toUpperCase(),
        destinationPortName,
        eta: parsedEta,
        etaSource: input.data.etaSource,
        etaConfidence: input.data.etaConfidence,
        voyageStatus: input.data.voyageStatus,
        previousPort: input.data.previousPort ?? undefined,
        previousCargo: input.data.previousCargo ?? undefined,
        nextCargo: input.data.nextCargo ?? undefined,
        currentLat: input.data.currentLat ?? undefined,
        currentLon: input.data.currentLon ?? undefined,
        currentPort: input.data.currentPort ?? undefined,
        speedOverGround: input.data.speedOverGround ?? undefined,
        workspaceId: null,
      },
    });

    const matches = await matchCampaignsToETA(eta.id);

    const requestedEnroll = input.data.enrollCampaignIds ?? matches.filter((m) => m.autoEnroll).map((m) => m.campaignId);
    const triggers = requestedEnroll.length > 0 ? await createETATriggers(eta.id, requestedEnroll) : [];
    await Promise.all(triggers.map((trigger) => scheduleEtaTrigger(trigger.id)));

    emitWorkspaceEvent(workspaceId, "eta:created", { etaId: eta.id, matches: matches.length, triggers: triggers.length });

    return sendData(res, { eta, matches, triggers });
  } catch (error) {
    return next(error);
  }
});

vesselEtaRouter.post("/search", requireAuth, async (req, res, next) => {
  try {
    const input = searchSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const translated = input.data.filterConfig
      ? (filterConfigToWhereClause(input.data.filterConfig) as Prisma.VesselETAWhereInput)
      : {};
    // Include workspace-scoped ETAs the user owns AND global (super-admin
    // authored) ETAs. Otherwise a global admin ETA would be invisible to
    // regular users on their ETA search page.
    const scope: Prisma.VesselETAWhereInput = {
      OR: [workspaceStrictScope(workspaceId), { workspaceId: null }],
    };
    const where: Prisma.VesselETAWhereInput = {
      AND: [scope, { eta: { gte: new Date() } }, translated],
    };

    const etas = await prisma.vesselETA.findMany({
      where,
      orderBy: { eta: "asc" },
      take: input.data.limit + 1,
      cursor: input.data.cursor ? { id: input.data.cursor } : undefined,
      skip: input.data.cursor ? 1 : 0,
      include: {
        vessel: {
          select: {
            id: true,
            imoNumber: true,
            vesselName: true,
            vesselType: true,
            flag: true,
            dwt: true,
            shipOwnerCompany: { select: { id: true, companyName: true, email: true, country: true } },
            ismManagerCompany: { select: { id: true, companyName: true, email: true, country: true } },
            commercialManagerCompany: { select: { id: true, companyName: true, email: true, country: true } },
          },
        },
        port: { select: { portCode: true, portName: true, region: true, country: true } },
        triggers: {
          select: {
            id: true,
            status: true,
            campaign: { select: { id: true, name: true } },
            nextFireAt: true,
            lastFiredStep: true,
          },
        },
      },
    });

    const hasMore = etas.length > input.data.limit;
    const slice = hasMore ? etas.slice(0, input.data.limit) : etas;
    const nextCursor = hasMore ? slice[slice.length - 1]?.id ?? null : null;
    const count = await prisma.vesselETA.count({ where });

    return sendData(res, { etas: slice, count, nextCursor });
  } catch (error) {
    return next(error);
  }
});

vesselEtaRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    // Global (workspaceId=null) ETAs are readable by every workspace.
    const eta = await prisma.vesselETA.findFirst({
      where: { id: req.params.id, OR: [{ workspaceId }, { workspaceId: null }] },
      include: {
        vessel: true,
        port: true,
        triggers: { include: { campaign: { select: { id: true, name: true } } } },
      },
    });
    if (!eta) return sendError(res, 404, "NOT_FOUND", "ETA not found");
    return sendData(res, eta);
  } catch (error) {
    return next(error);
  }
});

vesselEtaRouter.patch("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const input = updateSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    // Super-admin PATCH can touch any ETA regardless of which workspace it
    // originated in — that's the whole point of "admin ETA edits propagate to
    // everyone." Look the row up unscoped, then promote it to global on save.
    const existing = await prisma.vesselETA.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "ETA not found");

    const data: Prisma.VesselETAUpdateInput = {
      // Every super-admin edit promotes the ETA to global so all workspaces
      // see the corrected data. Regular workspace-scoped ETAs never end up in
      // this endpoint (it's requireSuperAdmin), so this can't accidentally
      // demote a user's private ETA to public.
      workspace: { disconnect: true },
    };
    if (input.data.destinationPort !== undefined) {
      const newPort = input.data.destinationPort.toUpperCase();
      data.port = { connect: { portCode: newPort } };
      data.destinationPortName = await resolvePortName(newPort, input.data.destinationPortName);
    } else if (input.data.destinationPortName !== undefined) {
      data.destinationPortName = input.data.destinationPortName;
    }
    if (input.data.eta !== undefined) {
      const parsedEta = parseFlexibleEta(input.data.eta);
      if (!parsedEta) {
        return sendError(res, 400, "VALIDATION_ERROR", `Invalid ETA timestamp: ${input.data.eta}`);
      }
      data.eta = parsedEta;
    }
    if (input.data.etaSource !== undefined) data.etaSource = input.data.etaSource;
    if (input.data.etaConfidence !== undefined) data.etaConfidence = input.data.etaConfidence;
    if (input.data.voyageStatus !== undefined) data.voyageStatus = input.data.voyageStatus;
    if (input.data.previousPort !== undefined) data.previousPort = input.data.previousPort;
    if (input.data.previousCargo !== undefined) data.previousCargo = input.data.previousCargo;
    if (input.data.nextCargo !== undefined) data.nextCargo = input.data.nextCargo;
    if (input.data.currentLat !== undefined) data.currentLat = input.data.currentLat;
    if (input.data.currentLon !== undefined) data.currentLon = input.data.currentLon;
    if (input.data.currentPort !== undefined) data.currentPort = input.data.currentPort;
    if (input.data.speedOverGround !== undefined) data.speedOverGround = input.data.speedOverGround;

    const updated = await prisma.vesselETA.update({ where: { id: existing.id }, data });

    if (input.data.eta !== undefined) {
      await recomputeETATriggerTimes(existing.id);
      const triggers = await prisma.eTATrigger.findMany({
        where: { vesselEtaId: existing.id, status: { in: ["PENDING", "ACTIVE"] } },
        select: { id: true },
      });
      await Promise.all(triggers.map((trigger) => rescheduleEtaTrigger(trigger.id)));
    }

    emitWorkspaceEvent(workspaceId, "eta:updated", { etaId: existing.id });
    return sendData(res, updated);
  } catch (error) {
    return next(error);
  }
});

vesselEtaRouter.delete("/:id", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    // Super-admin can delete any ETA (including workspace-scoped ones from
    // other workspaces) so cleanup works for the "global ETA" flow too.
    const existing = await prisma.vesselETA.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "ETA not found");
    await prisma.vesselETA.delete({ where: { id: existing.id } });
    emitWorkspaceEvent(workspaceId, "eta:deleted", { etaId: existing.id });
    return sendData(res, { id: existing.id });
  } catch (error) {
    return next(error);
  }
});

vesselEtaRouter.get("/:id/suggestions", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.vesselETA.findFirst({
      where: { id: req.params.id, OR: [{ workspaceId }, { workspaceId: null }] },
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "ETA not found");
    const matches = await matchCampaignsToETA(existing.id);
    return sendData(res, { matches });
  } catch (error) {
    return next(error);
  }
});

const ETA_CSV_TEMPLATE_HEADERS = ["IMO", "ETA", "Destination Port"] as const;
const ETA_CSV_TEMPLATE = `${ETA_CSV_TEMPLATE_HEADERS.join(",")}\n9434761,2026-06-15T08:00:00Z,INMUN\n9876543,2026-06-18T14:30:00Z,SGSIN\n`;

vesselEtaRouter.get("/csv/template", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="vessel-eta-template.csv"');
  res.send(ETA_CSV_TEMPLATE);
});

const bulkUpdateSchema = z.object({ csv: z.string().min(1) });

function normalizeHeader(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const IMO_HEADER_KEYS = new Set(["imo", "imonumber"]);
const ETA_HEADER_KEYS = new Set(["eta", "etautc", "etadate", "newata", "newata"]);
const PORT_HEADER_KEYS = new Set(["destinationport", "port", "destination"]);
// Additional columns recognised on admin bulk uploads. When a row references
// an IMO we don't yet have in the Vessel table, we create the vessel row on
// the fly from whatever of these are populated — so an admin CSV like the
// "INDIA and BRAZIL" schedule (which carries owner / manager / cargo
// metadata) doesn't drop any rows just because the vessel wasn't already in
// our DB. Regular users still hit the "vessel not found" skip path.
const VESSEL_NAME_KEYS = new Set(["vesselname", "shipname", "name"]);
const MMSI_KEYS = new Set(["mmsi"]);
const CALLSIGN_KEYS = new Set(["callsign", "callingsign"]);
const TYPE_KEYS = new Set(["type", "vesseltype", "shiptype"]);
const DWT_KEYS = new Set(["dwt", "deadweight", "deadweighttonnage"]);
const GT_KEYS = new Set(["grosstonnage", "gt"]);
const NT_KEYS = new Set(["nettonnage", "nt"]);
const BUILT_KEYS = new Set(["builtyear", "yearbuilt", "year", "built"]);
const LENGTH_KEYS = new Set(["length", "loa", "lengthoverall"]);
const OWNER_NAME_KEYS = new Set(["shipowner", "registeredowner", "ownername", "owner"]);
const OWNER_EMAIL_KEYS = new Set(["shipowneremail", "registeredowneremail", "owneremail"]);
const OWNER_COUNTRY_KEYS = new Set(["shipownercountry", "registeredownercountry", "ownercountry"]);
const COMM_MGR_NAME_KEYS = new Set(["commercialmanager", "commercialmanagername"]);
const COMM_MGR_EMAIL_KEYS = new Set(["commercialmanageremail"]);
const COMM_MGR_COUNTRY_KEYS = new Set(["commercialmanagercountry"]);
const ISM_MGR_NAME_KEYS = new Set(["ismmanager", "ismmanagername"]);
const ISM_MGR_EMAIL_KEYS = new Set(["ismmanageremail"]);
const ISM_MGR_COUNTRY_KEYS = new Set(["ismmanagercountry"]);

function pickHeaderIndex(headers: string[], match: Set<string>) {
  return headers.findIndex((h) => match.has(normalizeHeader(h)));
}

/**
 * Best-effort ETA parser that accepts the formats admin CSVs actually ship
 * with — ISO 8601 (`2026-06-15T08:00:00Z`), US slash dates with optional
 * time (`7/26/2026 19:00`, `7/26/2026`), and space-separated ISO-ish
 * (`2026-06-15 08:00`). All parsed as UTC (matches the CSV column header
 * "ETA (UTC)") so timezones don't drift silently between users.
 *
 * Returns null on anything we can't interpret so the caller can push a
 * clean row-level error instead of letting `new Date("garbage")` produce
 * an Invalid Date that fails validation halfway through the pipeline.
 */
function parseFlexibleEta(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO 8601 first — includes timezone info, no ambiguity.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // ISO-ish "YYYY-MM-DD HH:MM[:SS]" — treated as UTC.
  const isoLoose = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (isoLoose) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = isoLoose;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }

  // US slash form "M/D/YYYY" with optional " H:MM" or " H:MM:SS" and an
  // optional AM/PM suffix. This is the format sighting feeds and Excel
  // exports overwhelmingly use, and matches your INDIA/BRAZIL CSV.
  const slash = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i,
  );
  if (slash) {
    const [, mo, d, yRaw, hRaw = "0", miRaw = "0", sRaw = "0", ampm] = slash;
    let hours = Number(hRaw);
    if (ampm) {
      const isPm = ampm.toLowerCase() === "pm";
      if (isPm && hours < 12) hours += 12;
      else if (!isPm && hours === 12) hours = 0;
    }
    // Two-digit year → 2000s (schedules never live in 19xx).
    const y = Number(yRaw);
    const year = y < 100 ? 2000 + y : y;
    const parsed = Date.UTC(year, Number(mo) - 1, Number(d), hours, Number(miRaw), Number(sRaw));
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }

  // Fallback: hand to the JS engine and hope it recognises the shape.
  // Anything genuinely unparseable comes back as Invalid Date → null.
  const native = new Date(trimmed);
  return Number.isNaN(native.getTime()) ? null : native;
}

function csvValue(row: string[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const raw = row[idx]?.trim();
  if (!raw || raw === "-" || raw === "—") return undefined;
  return raw;
}

function csvInt(row: string[], idx: number): number | undefined {
  const raw = csvValue(row, idx);
  if (!raw) return undefined;
  const n = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function csvFloat(row: string[], idx: number): number | undefined {
  const raw = csvValue(row, idx);
  if (!raw) return undefined;
  const n = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Map free-text CSV vessel-type strings ("Bulk Carrier", "Tanker LPG",
 * "Container Ship", …) to our VesselType enum. Anything we don't recognise
 * falls back to OTHER — same behaviour as manual vessel entry.
 */
function normalizeVesselType(raw: string | undefined): Prisma.VesselCreateInput["vesselType"] {
  if (!raw) return "OTHER";
  const key = raw.toLowerCase();
  if (key.includes("bulk")) return "BULK_CARRIER";
  if (key.includes("crude")) return "TANKER_CRUDE";
  if (key.includes("product")) return "TANKER_PRODUCT";
  if (key.includes("chemical")) return "TANKER_CHEMICAL";
  if (key.includes("lpg")) return "TANKER_LPG";
  if (key.includes("lng")) return "TANKER_LNG";
  if (key.includes("container")) return "CONTAINER";
  if (key.includes("general cargo") || key === "cargo") return "GENERAL_CARGO";
  if (key.includes("roro") || key.includes("ro-ro")) return "RORO";
  if (key.includes("psv") || key.includes("supply")) return "OFFSHORE_PSV";
  if (key.includes("ahts")) return "OFFSHORE_AHTS";
  if (key.includes("drill")) return "OFFSHORE_DRILL";
  if (key.includes("ferry")) return "FERRY";
  if (key.includes("cruise")) return "CRUISE";
  if (key.includes("dredger")) return "DREDGER";
  if (key.includes("heavy lift")) return "HEAVY_LIFT";
  if (key.includes("barge")) return "BARGE";
  if (key.includes("research")) return "RESEARCH";
  if (key.includes("tanker")) return "TANKER_PRODUCT";
  return "OTHER";
}

vesselEtaRouter.post("/bulk-update", requireAuth, async (req, res, next) => {
  try {
    const input = bulkUpdateSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    // ETAs are global — every CSV bulk upload writes workspaceId=null so
    // every workspace sees the same voyage schedule. isAdmin is still used
    // downstream to control which vessels are addressable (globals are only
    // reachable via admin uploads or the vessel-CSV import path).
    const isAdmin = await isActorSuperAdmin(userId);

    let records: string[][];
    try {
      records = parse(input.data.csv, {
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
      }) as string[][];
    } catch (error) {
      return sendError(res, 400, "INVALID_CSV", error instanceof Error ? error.message : "Unable to parse CSV");
    }

    if (records.length < 2) {
      return sendError(res, 400, "INVALID_CSV", "CSV must include a header row and at least one data row");
    }

    const headers = records[0] ?? [];
    const imoIdx = pickHeaderIndex(headers, IMO_HEADER_KEYS);
    const etaIdx = pickHeaderIndex(headers, ETA_HEADER_KEYS);
    const portIdx = pickHeaderIndex(headers, PORT_HEADER_KEYS);
    // Optional columns — populated on admin uploads to backfill the vessel
    // when we haven't seen it before.
    const nameIdx = pickHeaderIndex(headers, VESSEL_NAME_KEYS);
    const mmsiIdx = pickHeaderIndex(headers, MMSI_KEYS);
    const callsignIdx = pickHeaderIndex(headers, CALLSIGN_KEYS);
    const typeIdx = pickHeaderIndex(headers, TYPE_KEYS);
    const dwtIdx = pickHeaderIndex(headers, DWT_KEYS);
    const gtIdx = pickHeaderIndex(headers, GT_KEYS);
    const ntIdx = pickHeaderIndex(headers, NT_KEYS);
    const builtIdx = pickHeaderIndex(headers, BUILT_KEYS);
    const lengthIdx = pickHeaderIndex(headers, LENGTH_KEYS);
    const ownerNameIdx = pickHeaderIndex(headers, OWNER_NAME_KEYS);
    const ownerEmailIdx = pickHeaderIndex(headers, OWNER_EMAIL_KEYS);
    const ownerCountryIdx = pickHeaderIndex(headers, OWNER_COUNTRY_KEYS);
    const commMgrNameIdx = pickHeaderIndex(headers, COMM_MGR_NAME_KEYS);
    const commMgrEmailIdx = pickHeaderIndex(headers, COMM_MGR_EMAIL_KEYS);
    const commMgrCountryIdx = pickHeaderIndex(headers, COMM_MGR_COUNTRY_KEYS);
    const ismMgrNameIdx = pickHeaderIndex(headers, ISM_MGR_NAME_KEYS);
    const ismMgrEmailIdx = pickHeaderIndex(headers, ISM_MGR_EMAIL_KEYS);
    const ismMgrCountryIdx = pickHeaderIndex(headers, ISM_MGR_COUNTRY_KEYS);

    if (imoIdx === -1 || etaIdx === -1) {
      return sendError(
        res,
        400,
        "INVALID_CSV",
        'CSV must have "IMO" and "ETA" columns. Download the template to see the expected format.',
      );
    }

    const MAX_ROWS = 5000;
    const dataRows = records.slice(1);
    if (dataRows.length > MAX_ROWS) {
      return sendError(res, 400, "TOO_MANY_ROWS", `CSV has too many rows. Maximum is ${MAX_ROWS}.`);
    }

    type VesselCsvFields = {
      vesselName?: string;
      mmsi?: string;
      callsign?: string;
      vesselType?: Prisma.VesselCreateInput["vesselType"];
      dwt?: number;
      grossTonnage?: number;
      netTonnage?: number;
      builtYear?: number;
      lengthOverall?: number;
      registeredOwnerName?: string;
      registeredOwnerEmail?: string;
      registeredOwnerCountry?: string;
      commercialManagerName?: string;
      commercialManagerEmail?: string;
      commercialManagerCountry?: string;
      ismManagerName?: string;
      ismManagerEmail?: string;
      ismManagerCountry?: string;
    };

    type ParsedRow = {
      row: number;
      imo: string;
      eta: Date;
      portCode?: string;
      portRaw?: string;
      vesselFields: VesselCsvFields;
    };
    const parsedRows: ParsedRow[] = [];
    const errors: Array<{ row: number; imo?: string; message: string }> = [];

    for (const [index, record] of dataRows.entries()) {
      const rowNumber = index + 2;
      const imoRaw = record[imoIdx]?.trim();
      const etaRaw = record[etaIdx]?.trim();

      if (!imoRaw && !etaRaw) continue;

      if (!imoRaw || !/^\d{7}$/.test(imoRaw)) {
        errors.push({ row: rowNumber, imo: imoRaw, message: "IMO must be exactly 7 digits" });
        continue;
      }
      if (!etaRaw) {
        errors.push({ row: rowNumber, imo: imoRaw, message: "ETA is required" });
        continue;
      }
      const etaDate = parseFlexibleEta(etaRaw);
      if (!etaDate) {
        errors.push({ row: rowNumber, imo: imoRaw, message: `Invalid ETA timestamp: ${etaRaw}` });
        continue;
      }
      const portRaw = portIdx !== -1 ? record[portIdx]?.trim() || undefined : undefined;
      const portCode = portRaw ? normalizePortValue(portRaw) : undefined;
      const vesselFields: VesselCsvFields = {
        vesselName: csvValue(record, nameIdx),
        mmsi: csvValue(record, mmsiIdx),
        callsign: csvValue(record, callsignIdx),
        vesselType: normalizeVesselType(csvValue(record, typeIdx)),
        dwt: csvInt(record, dwtIdx),
        grossTonnage: csvInt(record, gtIdx),
        netTonnage: csvInt(record, ntIdx),
        builtYear: csvInt(record, builtIdx),
        lengthOverall: csvFloat(record, lengthIdx),
        registeredOwnerName: csvValue(record, ownerNameIdx),
        registeredOwnerEmail: csvValue(record, ownerEmailIdx),
        registeredOwnerCountry: csvValue(record, ownerCountryIdx),
        commercialManagerName: csvValue(record, commMgrNameIdx),
        commercialManagerEmail: csvValue(record, commMgrEmailIdx),
        commercialManagerCountry: csvValue(record, commMgrCountryIdx),
        ismManagerName: csvValue(record, ismMgrNameIdx),
        ismManagerEmail: csvValue(record, ismMgrEmailIdx),
        ismManagerCountry: csvValue(record, ismMgrCountryIdx),
      };
      parsedRows.push({ row: rowNumber, imo: imoRaw, eta: etaDate, portCode, portRaw, vesselFields });
    }

    const uniqueImos = Array.from(new Set(parsedRows.map((r) => r.imo)));

    // Admin: match vessels across every workspace (including global rows) so
    // an admin publishing an ETA for a vessel that some other workspace owns
    // still resolves the vessel. Regular user: only their own workspace's
    // vessels can be edited, matching existing behavior.
    const vesselWhere: Prisma.VesselWhereInput = isAdmin
      ? { imoNumber: { in: uniqueImos } }
      : { imoNumber: { in: uniqueImos }, ...workspaceScope(workspaceId) };
    const [vessels, latestEtas] = await Promise.all([
      prisma.vessel.findMany({
        where: vesselWhere,
        select: { id: true, imoNumber: true },
      }),
      uniqueImos.length === 0
        ? Promise.resolve([] as Array<{ id: string; vesselId: string; destinationPort: string; eta: Date }>)
        : isAdmin
          ? // Admin: latest ETA per vessel across every workspace — the one
            // they'll update in-place (and promote to global below).
            prisma.$queryRaw<Array<{ id: string; vesselId: string; destinationPort: string; eta: Date }>>`
              SELECT DISTINCT ON ("vesselId") "id", "vesselId", "destinationPort", "eta"
              FROM "VesselETA"
              WHERE "vesselId" IN (
                SELECT "id" FROM "Vessel"
                WHERE "imoNumber" = ANY(${uniqueImos}::text[])
              )
              ORDER BY "vesselId", "eta" DESC
            `
          : prisma.$queryRaw<Array<{ id: string; vesselId: string; destinationPort: string; eta: Date }>>`
              SELECT DISTINCT ON ("vesselId") "id", "vesselId", "destinationPort", "eta"
              FROM "VesselETA"
              WHERE "workspaceId" = ${workspaceId}
                AND "vesselId" IN (
                  SELECT "id" FROM "Vessel"
                  WHERE ("workspaceId" = ${workspaceId} OR "workspaceId" IS NULL)
                    AND "imoNumber" = ANY(${uniqueImos}::text[])
                )
              ORDER BY "vesselId", "eta" DESC
            `,
    ]);

    const vesselByImo = new Map(vessels.map((v) => [v.imoNumber, v.id]));
    const latestEtaByVessel = new Map(
      latestEtas.map((e) => [
        e.vesselId,
        { id: e.id, destinationPort: e.destinationPort, eta: new Date(e.eta) },
      ]),
    );

    let updated = 0;
    let created = 0;
    let skippedNotFound = 0;
    let skippedStale = 0;
    let vesselsCreated = 0;

    // Admin uploads: any IMO we haven't seen becomes a fresh global Vessel
    // row (workspaceId=null) built from whatever CSV columns are populated —
    // otherwise the ETA row below has nothing to attach to and the "vessel
    // not found" skip drops the entire row. Deduped by IMO so a CSV with
    // multiple ETAs for the same vessel only creates the vessel once.
    if (isAdmin) {
      const missingImos = Array.from(
        new Set(parsedRows.filter((row) => !vesselByImo.has(row.imo)).map((row) => row.imo)),
      );
      for (const imo of missingImos) {
        const source = parsedRows.find((row) => row.imo === imo);
        if (!source) continue;
        const fields = source.vesselFields;
        try {
          const created = await prisma.vessel.create({
            data: {
              imoNumber: imo,
              vesselName: fields.vesselName ?? `IMO ${imo}`,
              vesselType: fields.vesselType ?? "OTHER",
              mmsi: fields.mmsi,
              callsign: fields.callsign,
              dwt: fields.dwt,
              grossTonnage: fields.grossTonnage,
              netTonnage: fields.netTonnage,
              builtYear: fields.builtYear,
              lengthOverall: fields.lengthOverall,
              registeredOwnerName: fields.registeredOwnerName,
              registeredOwnerEmail: fields.registeredOwnerEmail,
              registeredOwnerCountry: fields.registeredOwnerCountry,
              commercialManagerName: fields.commercialManagerName,
              commercialManagerEmail: fields.commercialManagerEmail,
              commercialManagerCountry: fields.commercialManagerCountry,
              ismManagerName: fields.ismManagerName,
              ismManagerEmail: fields.ismManagerEmail,
              ismManagerCountry: fields.ismManagerCountry,
              workspaceId: null,
              source: "CSV_IMPORT",
              verified: true,
            },
            select: { id: true },
          });
          vesselByImo.set(imo, created.id);
          vesselsCreated += 1;
        } catch (err) {
          // MMSI uniqueness or Prisma validation could throw — retry without
          // MMSI so the ETA still lands, and record a soft error for the
          // admin to see in the response.
          if (fields.mmsi) {
            try {
              const created = await prisma.vessel.create({
                data: {
                  imoNumber: imo,
                  vesselName: fields.vesselName ?? `IMO ${imo}`,
                  vesselType: fields.vesselType ?? "OTHER",
                  workspaceId: null,
                  source: "CSV_IMPORT",
                  verified: true,
                },
                select: { id: true },
              });
              vesselByImo.set(imo, created.id);
              vesselsCreated += 1;
              continue;
            } catch {
              // Fall through to the outer error path below.
            }
          }
          errors.push({
            row: source.row,
            imo,
            message: `Couldn't auto-create vessel: ${(err as Error).message}`,
          });
        }
      }
    }

    const portInputs = new Set<string>();
    for (const row of parsedRows) {
      const raw = row.portRaw ?? row.portCode;
      if (raw) portInputs.add(raw);
    }
    const portCache = new Map<string, { portCode: string; portName: string } | null>();
    await Promise.all(
      Array.from(portInputs).map(async (raw) => {
        try {
          portCache.set(raw, await ensureDestinationPort(raw));
        } catch {
          portCache.set(raw, null);
        }
      }),
    );

    const rowsToProcess: ParsedRow[] = [];
    for (const row of parsedRows) {
      const vesselId = vesselByImo.get(row.imo);
      if (!vesselId) {
        skippedNotFound += 1;
        continue;
      }
      const latest = latestEtaByVessel.get(vesselId);
      if (!latest && !row.portCode) {
        errors.push({
          row: row.row,
          imo: row.imo,
          message: "Vessel has no existing ETA. Destination Port is required to create one.",
        });
        continue;
      }
      rowsToProcess.push(row);
    }

    const BATCH_SIZE = 25;
    for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
      const slice = rowsToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        slice.map(async (row) => {
          const vesselId = vesselByImo.get(row.imo)!;
          const latest = latestEtaByVessel.get(vesselId);
          const portRaw = row.portRaw ?? row.portCode;
          const resolvedPort = portRaw ? portCache.get(portRaw) ?? null : null;

          if (latest) {
            // Only overwrite the existing ETA when the CSV row's ETA is
            // strictly later than what we already have. This is the "latest
            // data wins" rule the admin uploads should follow: a re-upload
            // of stale data (or the same schedule twice) shouldn't rewind a
            // ship's ETA. Equal timestamps are treated as stale so re-runs
            // are a no-op. Port changes still get picked up alongside the
            // ETA move when the row does update.
            const rowIsNewer = row.eta.getTime() > latest.eta.getTime();
            const portChanging =
              !!(row.portCode && row.portCode !== latest.destinationPort && resolvedPort);
            if (!rowIsNewer && !portChanging) {
              return { kind: "stale" as const, vesselId };
            }
            let destinationPort = latest.destinationPort;
            const data: Prisma.VesselETAUpdateInput = {
              etaSource: "CSV_IMPORT",
              // ETAs are global — every CSV update (admin or otherwise)
              // promotes the row to global so every workspace sees the
              // corrected value. The old per-workspace binding was the
              // source of the "duplicate ETA per port" problem.
              workspace: { disconnect: true },
            };
            if (rowIsNewer) data.eta = row.eta;
            if (portChanging && resolvedPort) {
              data.port = { connect: { portCode: resolvedPort.portCode } };
              data.destinationPortName = resolvedPort.portName;
              destinationPort = resolvedPort.portCode;
            }
            await prisma.vesselETA.update({ where: { id: latest.id }, data });
            return {
              kind: "updated" as const,
              vesselId,
              etaId: latest.id,
              destinationPort,
              eta: rowIsNewer ? row.eta : latest.eta,
            };
          }

          if (!resolvedPort) {
            return {
              kind: "error" as const,
              error: { row: row.row, imo: row.imo, message: `Unknown Destination Port: ${row.portRaw}` },
            };
          }
          const eta = await prisma.vesselETA.create({
            data: {
              vesselId,
              destinationPort: resolvedPort.portCode,
              destinationPortName: resolvedPort.portName,
              eta: row.eta,
              etaSource: "CSV_IMPORT",
              etaConfidence: "ESTIMATED",
              // ETAs are global — every workspace sees the same voyage
              // schedule for a given vessel.
              workspaceId: null,
            },
          });
          return {
            kind: "created" as const,
            vesselId,
            etaId: eta.id,
            destinationPort: resolvedPort.portCode,
            eta: row.eta,
          };
        }),
      );

      for (const r of results) {
        if (r.kind === "updated") {
          latestEtaByVessel.set(r.vesselId, {
            id: r.etaId,
            destinationPort: r.destinationPort,
            eta: r.eta,
          });
          updated += 1;
        } else if (r.kind === "created") {
          latestEtaByVessel.set(r.vesselId, {
            id: r.etaId,
            destinationPort: r.destinationPort,
            eta: r.eta,
          });
          created += 1;
        } else if (r.kind === "stale") {
          skippedStale += 1;
        } else {
          errors.push(r.error);
        }
      }
    }

    emitWorkspaceEvent(workspaceId, "eta:bulk-updated", {
      updated,
      created,
      vesselsCreated,
      skippedNotFound,
      skippedStale,
      errors: errors.length,
    });

    return sendData(res, {
      processed: dataRows.length,
      updated,
      created,
      vesselsCreated,
      skippedNotFound,
      skippedStale,
      errors,
    });
  } catch (error) {
    return next(error);
  }
});

const enrollSchema = z.object({ campaignIds: z.array(z.string()).min(1) });
vesselEtaRouter.post("/:id/enroll", requireAuth, async (req, res, next) => {
  try {
    const input = enrollSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.vesselETA.findFirst({
      where: { id: req.params.id, OR: [{ workspaceId }, { workspaceId: null }] },
    });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "ETA not found");
    const triggers = await createETATriggers(existing.id, input.data.campaignIds);
    return sendData(res, { triggers });
  } catch (error) {
    return next(error);
  }
});
