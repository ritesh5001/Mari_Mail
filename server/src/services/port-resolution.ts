import { prisma } from "@marimail/db";

export type ResolvedDestinationPort = {
  portCode: string;
  portName: string;
};

/**
 * Country code stamped on ports the importer had to invent because the CSV's
 * destination didn't match anything in the registry. These are placeholders,
 * not real geography — Port Radar's country filter can never match one, so a
 * placeholder must never win over a genuine registry entry.
 */
export const UNKNOWN_PORT_COUNTRY = "XX";

export function normalizePortValue(value: string | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function titleCasePortName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Pure, DB-free validity check for a destination value. `resolveDestinationPort`
 * only ever returns null when the value normalizes to empty (otherwise it falls
 * back to a synthesized port), so validation during CSV preview needs nothing
 * more than this — avoiding a per-row DB round-trip that made large-file preview
 * time out (504). Actual port resolution/creation still happens at import time.
 */
export function isResolvableDestination(rawValue: string | undefined): boolean {
  return Boolean(normalizePortValue(rawValue));
}

type PortRow = { portCode: string; portName: string; country: string };

/**
 * Every normalised string a registry port should be findable by.
 *
 * Registry names routinely carry a qualifier — "Doha, Qatar", "Umm Sa'id
 * (Mesaieed)", "Mina Zayed/Abu Dhabi" — while CSVs carry the bare common name.
 * Matching only the whole string meant "DOHA" could not find "Doha, Qatar", so
 * the importer invented a placeholder port for a port that was already on file.
 * Indexing the qualified head (and any parenthesised alias) fixes that class of
 * miss without loosening the match to a substring, which would happily confuse
 * "Port Said" with "Port".
 */
function portKeys(port: PortRow): string[] {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = normalizePortValue(value);
    if (normalized) keys.add(normalized);
  };

  add(port.portCode);
  add(port.portName);
  add(port.portName.split(",")[0]);
  add(port.portName.split("/")[0]);
  add(port.portName.split("(")[0]);
  const parenthesised = port.portName.match(/\(([^)]+)\)/);
  if (parenthesised) add(parenthesised[1]);

  return [...keys];
}

const INDEX_TTL_MS = 5 * 60 * 1000;
let indexPromise: Promise<Map<string, PortRow>> | null = null;
let indexLoadedAt = 0;

/**
 * In-memory alias → port index over the whole registry (~11k rows).
 *
 * Resolution used to cost two or three queries PER CSV ROW. Against a remote
 * database that is ~76ms each, which is most of what a large import spends its
 * time on. The registry is reference data, so it's loaded once and reused.
 */
async function portIndex(): Promise<Map<string, PortRow>> {
  if (indexPromise && Date.now() - indexLoadedAt < INDEX_TTL_MS) return indexPromise;
  indexLoadedAt = Date.now();
  indexPromise = (async () => {
    const ports = await prisma.port.findMany({
      select: { portCode: true, portName: true, country: true },
    });
    const index = new Map<string, PortRow>();
    // Real ports are indexed first and never overwritten, so a placeholder left
    // behind by an earlier import cannot shadow the genuine entry it duplicates.
    const realFirst = [...ports].sort(
      (a, b) =>
        Number(a.country === UNKNOWN_PORT_COUNTRY) - Number(b.country === UNKNOWN_PORT_COUNTRY),
    );
    for (const port of realFirst) {
      for (const key of portKeys(port)) {
        if (!index.has(key)) index.set(key, port);
      }
    }
    return index;
  })();
  return indexPromise;
}

/** Drops the cached registry index. Call after bulk port edits/repairs. */
export function invalidatePortIndex() {
  indexPromise = null;
  indexLoadedAt = 0;
}

async function rememberPort(port: PortRow) {
  if (!indexPromise) return;
  const index = await indexPromise;
  for (const key of portKeys(port)) {
    if (!index.has(key)) index.set(key, port);
  }
}

export async function resolveDestinationPort(
  rawValue: string | undefined,
): Promise<ResolvedDestinationPort | null> {
  const raw = rawValue?.trim();
  const normalized = normalizePortValue(raw);
  if (!raw || !normalized) return null;

  const match = (await portIndex()).get(normalized);
  if (match) return { portCode: match.portCode, portName: match.portName };

  // Genuinely unknown destination — synthesise a placeholder code from the
  // value itself so repeat sightings at least collapse onto one port row.
  return { portCode: normalized, portName: titleCasePortName(raw) };
}

/** Country name for an ISO code, read off the registry so there's no second list. */
async function countryNameFor(code: string): Promise<string | null> {
  const row = await prisma.port.findFirst({
    where: { country: code, countryName: { not: "" } },
    select: { countryName: true },
  });
  return row?.countryName ?? null;
}

/**
 * @param fallbackCountry ISO-2 country this destination is known to belong to,
 *   from the country the operator picked for the import batch. A destination
 *   that isn't in the registry — Qatar's Hamad Port, say — would otherwise be
 *   filed under "XX"/Unknown, which Port Radar's country filter can never
 *   match, so the row imports successfully and is then invisible. Stamping the
 *   batch's country keeps it findable.
 */
export async function ensureDestinationPort(rawValue: string | undefined, fallbackCountry?: string) {
  const resolved = await resolveDestinationPort(rawValue);
  if (!resolved) return null;

  const existing = await prisma.port.findFirst({
    where: { portCode: { equals: resolved.portCode, mode: "insensitive" } },
    select: { portCode: true, portName: true, country: true },
  });
  if (existing) {
    // An earlier import may have filed this as Unknown before we knew the
    // batch country. Promote it now rather than leaving it stranded.
    if (existing.country === UNKNOWN_PORT_COUNTRY && fallbackCountry) {
      const countryName = await countryNameFor(fallbackCountry);
      if (countryName) {
        await prisma.port.updateMany({
          where: { portCode: existing.portCode, country: UNKNOWN_PORT_COUNTRY },
          data: { country: fallbackCountry, countryName },
        });
        invalidatePortIndex();
      }
    }
    await rememberPort(existing);
    return { portCode: existing.portCode, portName: existing.portName };
  }

  const country = fallbackCountry ?? UNKNOWN_PORT_COUNTRY;
  const countryName = fallbackCountry ? await countryNameFor(fallbackCountry) : null;
  const created = await prisma.port.create({
    data: {
      portCode: resolved.portCode,
      portName: resolved.portName,
      country: countryName ? country : UNKNOWN_PORT_COUNTRY,
      countryName: countryName ?? "Unknown",
      region: "EUROPE",
      portType: ["COMMERCIAL"],
      defaultServices: [],
    },
    select: { portCode: true, portName: true, country: true },
  });
  await rememberPort(created);
  return { portCode: created.portCode, portName: created.portName };
}
