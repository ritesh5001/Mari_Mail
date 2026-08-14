import { prisma, type EmailStatus } from "@marimail/db";
import {
  MaribizError,
  searchPersons as maribizSearchPersons,
  type MaribizPerson,
} from "./maribiz/client.js";
import { getOrCreateMaribizSettings } from "./maribiz/settings.js";
import { recordQuery as recordMaribizQuery } from "./maribiz/usage.js";

export type EmailWaterfallCandidate = {
  externalId: string;
  firstName: string;
  lastName: string;
  companyName: string;
  personLinkedinUrl?: string | null;
};

export type EmailWaterfallMatch = {
  email: string;
  emailStatus: EmailStatus;
  provider: "WORKSPACE_CACHE" | "MARIBIZ";
};

export class EmailWaterfallUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailWaterfallUnavailableError";
  }
}

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedLinkedin(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function usableEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (email.endsWith("@unknown.local")) return null;
  return email;
}

function companyMatches(left: string | null | undefined, right: string): boolean {
  const a = normalized(left);
  const b = normalized(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)));
}

/**
 * A secondary-provider row must identify the same person, not merely somebody
 * with a similar name. LinkedIn is the strongest key; otherwise both the full
 * name and company must agree before an email is accepted.
 */
export function matchWaterfallCandidate(
  candidate: EmailWaterfallCandidate,
  person: MaribizPerson,
): boolean {
  const wantedLinkedin = normalizedLinkedin(candidate.personLinkedinUrl);
  const foundLinkedin = normalizedLinkedin(person.person_linkedin_url);
  if (wantedLinkedin && foundLinkedin && wantedLinkedin === foundLinkedin) return true;

  const wantedName = normalized(`${candidate.firstName} ${candidate.lastName}`);
  const foundName = normalized(
    person.person_name || `${person.person_first_name ?? ""} ${person.person_last_name ?? ""}`,
  );
  return Boolean(
    wantedName &&
      foundName &&
      wantedName === foundName &&
      companyMatches(person.organization_name, candidate.companyName),
  );
}

function statusFromMaribiz(value: string | null | undefined): EmailStatus {
  const status = normalized(value);
  if (status === "verified" || status === "valid") return "VALID";
  if (status === "risky") return "RISKY";
  return "UNKNOWN";
}

export async function isEmailWaterfallConfigured(): Promise<boolean> {
  const settings = await getOrCreateMaribizSettings();
  return Boolean(
    settings.enabled &&
      process.env.MARIBIZ_API_URL?.trim() &&
      process.env.MARIBIZ_API_KEY?.trim(),
  );
}

/**
 * Paid fallback order after Apollo has no email:
 *   1. a verified contact already known inside this workspace;
 *   2. the configured MariMail secondary contact database.
 *
 * Callers perform confirmation and credit reservation before entering here.
 */
export async function searchEmailWaterfall(
  candidate: EmailWaterfallCandidate,
  workspaceId: string,
): Promise<EmailWaterfallMatch | null> {
  const identityClauses = [];
  if (candidate.personLinkedinUrl?.trim()) {
    identityClauses.push({ personLinkedinUrl: candidate.personLinkedinUrl.trim() });
  }
  if (candidate.firstName.trim() && candidate.lastName.trim() && candidate.companyName.trim()) {
    identityClauses.push({
      firstName: { equals: candidate.firstName.trim(), mode: "insensitive" as const },
      lastName: { equals: candidate.lastName.trim(), mode: "insensitive" as const },
      companyName: { equals: candidate.companyName.trim(), mode: "insensitive" as const },
    });
  }

  if (identityClauses.length > 0) {
    const known = await prisma.contact.findFirst({
      where: {
        workspaceId,
        email: { not: { endsWith: "@unknown.local" } },
        emailStatus: { not: "INVALID" },
        OR: identityClauses,
      },
      orderBy: { updatedAt: "desc" },
      select: { email: true, emailStatus: true },
    });
    const email = usableEmail(known?.email);
    if (email) {
      return {
        email,
        emailStatus: known?.emailStatus ?? "UNKNOWN",
        provider: "WORKSPACE_CACHE",
      };
    }
  }

  if (!(await isEmailWaterfallConfigured())) {
    throw new EmailWaterfallUnavailableError(
      "Waterfall email search is not configured — no credits were charged.",
    );
  }

  const query = [candidate.firstName, candidate.lastName, candidate.companyName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  try {
    await recordMaribizQuery();
    const result = await maribizSearchPersons({ q: query, limit: 25 });
    const person = result.rows.find(
      (row) => usableEmail(row.person_email) && matchWaterfallCandidate(candidate, row),
    );
    const email = usableEmail(person?.person_email);
    if (!person || !email) return null;
    return {
      email,
      emailStatus: statusFromMaribiz(person.person_email_status),
      provider: "MARIBIZ",
    };
  } catch (error) {
    const message = error instanceof MaribizError ? error.message : (error as Error).message;
    throw new EmailWaterfallUnavailableError(message || "Waterfall provider unavailable");
  }
}
