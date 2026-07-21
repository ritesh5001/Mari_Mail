import { prisma } from "@marimail/db";

export type ResolvedDestinationPort = {
  portCode: string;
  portName: string;
};

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

export async function resolveDestinationPort(rawValue: string | undefined): Promise<ResolvedDestinationPort | null> {
  const raw = rawValue?.trim();
  const normalized = normalizePortValue(raw);
  if (!raw || !normalized) return null;

  const exactCode = await prisma.port.findFirst({
    where: { portCode: { equals: normalized, mode: "insensitive" } },
    select: { portCode: true, portName: true },
  });
  if (exactCode) return exactCode;

  const candidates = await prisma.port.findMany({
    where: {
      OR: [
        { portName: { contains: raw, mode: "insensitive" } },
        { portCode: { contains: normalized, mode: "insensitive" } },
      ],
    },
    select: { portCode: true, portName: true },
    take: 25,
  });
  const normalizedMatch = candidates.find(
    (port) => normalizePortValue(port.portName) === normalized || normalizePortValue(port.portCode) === normalized,
  );
  if (normalizedMatch) return normalizedMatch;

  return { portCode: normalized, portName: titleCasePortName(raw) };
}

export async function ensureDestinationPort(rawValue: string | undefined) {
  const resolved = await resolveDestinationPort(rawValue);
  if (!resolved) return null;

  const existing = await prisma.port.findFirst({
    where: { portCode: { equals: resolved.portCode, mode: "insensitive" } },
    select: { portCode: true, portName: true },
  });
  if (existing) return existing;

  return prisma.port.create({
    data: {
      portCode: resolved.portCode,
      portName: resolved.portName,
      country: "XX",
      countryName: "Unknown",
      region: "EUROPE",
      portType: ["COMMERCIAL"],
      defaultServices: [],
    },
    select: { portCode: true, portName: true },
  });
}
