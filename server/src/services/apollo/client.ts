import { decryptJsonSecret } from "../email-account.service.js";
import { getOrCreateApolloSettings } from "./settings.js";

const TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = "https://api.apollo.io/api/v1";

export type ApolloOrganization = {
  id?: string | null;
  name?: string | null;
  website_url?: string | null;
  primary_domain?: string | null;
  linkedin_url?: string | null;
};

export type ApolloPerson = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  last_name_obfuscated?: string | null;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  email_status?: string | null;
  has_email?: boolean;
  has_direct_phone?: string | boolean | null;
  seniority?: string | null;
  linkedin_url?: string | null;
  phone_numbers?: Array<{ raw_number?: string | null; sanitized_number?: string | null; type?: string | null }> | null;
  organization?: ApolloOrganization | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export type ApolloSearchParams = {
  q_keywords?: string;
  person_titles?: string[];
  // Titles to exclude — Apollo supports `person_not_titles` on the same
  // `/mixed_people/api_search` endpoint. Same fuzzy match semantics as
  // person_titles, negated.
  person_not_titles?: string[];
  // Optional seniority filter — Apollo values are lowercased and slug-style
  // (e.g. "owner", "c_suite", "vp", "director", "manager").
  person_seniorities?: string[];
  q_organization_domains_list?: string[];
  organization_locations?: string[];
  // Where the PERSON is, as opposed to where their company is headquartered.
  // Cities, states or countries — Apollo resolves the string itself.
  person_locations?: string[];
  // Company headcount bands, each "min,max" (e.g. "1,10", "250,500").
  organization_num_employees_ranges?: string[];
  // "verified" | "unverified" | "likely to engage" | "unavailable".
  // Filtering here rather than after the fact means a page of 100 isn't
  // returned mostly full of rows the UI then hides.
  contact_email_status?: string[];
  // Widens person_titles to near-matches — Apollo's own "include similar
  // titles" toggle.
  include_similar_titles?: boolean;
  page?: number;
  per_page?: number;
};

export type ApolloSearchResult = {
  rows: ApolloPerson[];
  total: number;
  nextPage: number | null;
};

export type ApolloMatchOptions = {
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
};

export class ApolloError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "ApolloError";
  }
}

export type ApolloConfig = { baseUrl: string; apiKey: string };

async function getConfig(): Promise<ApolloConfig> {
  const settings = await getOrCreateApolloSettings();
  if (!settings.enabled) throw new ApolloError("Apollo integration is disabled", undefined, false);
  const decrypted = decryptJsonSecret<{ apiKey: string }>(settings.apiKey);
  const apiKey = decrypted?.apiKey?.trim();
  if (!apiKey) throw new ApolloError("Apollo API key is not configured", undefined, false);
  const baseUrl = (settings.apiBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { baseUrl, apiKey };
}

const MAX_RETRIES = 3;

function isTransient(status: number) {
  return status >= 500 || status === 429;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait before retrying. Prefers Apollo's own `Retry-After` header
 * (seconds, capped at 5s so a long value can't stall the whole fan-out),
 * else exponential backoff with jitter — the jitter matters because several
 * domain searches run concurrently and would otherwise all retry at the same
 * instant and re-trip the limit together.
 */
function retryDelayMs(response: Response, attemptIndex: number) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 5_000);
  const base = Math.min(500 * 2 ** attemptIndex, 4_000);
  return base + Math.random() * 250;
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  config?: ApolloConfig,
): Promise<T> {
  const { baseUrl, apiKey } = config ?? (await getConfig());
  const url = `${baseUrl}${path}`;

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let response: Response;
  try {
    response = await attempt();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApolloError("Apollo request timed out", undefined, true);
    }
    throw new ApolloError(`Apollo network error: ${(error as Error).message}`, undefined, true);
  }

  // Retry transient failures, INCLUDING 429.
  //
  // 429 was previously flagged `retryable: true` and then never retried — the
  // block below only covered 5xx. That made rate limiting fatal, which matters
  // because the by-list contact search fans out one request per company domain:
  // a large list would trip the limit, every domain would fail, and the UI
  // reported "Contact search is temporarily unavailable" with no results at all.
  //
  // Apollo sends `Retry-After` on 429; honour it when present, otherwise back
  // off exponentially with jitter so parallel callers don't retry in lockstep.
  for (let retry = 0; retry < MAX_RETRIES && isTransient(response.status); retry += 1) {
    await sleep(retryDelayMs(response, retry));
    try {
      response = await attempt();
    } catch (error) {
      throw new ApolloError(`Apollo retry failed: ${(error as Error).message}`, response.status, true);
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const retryable = response.status >= 500 || response.status === 429;
    throw new ApolloError(
      `Apollo ${response.status}: ${text.slice(0, 200) || response.statusText}`,
      response.status,
      retryable,
    );
  }

  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  const { baseUrl, apiKey } = await getConfig();
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ApolloError(
        `Apollo ${response.status}: ${text.slice(0, 200) || response.statusText}`,
        response.status,
        response.status >= 500 || response.status === 429,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApolloError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApolloError("Apollo request timed out", undefined, true);
    }
    throw new ApolloError(`Apollo network error: ${(error as Error).message}`, undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `config` routes the call through a specific Apollo account. Omitted, it uses
 * the platform key — every existing caller keeps its behaviour. Passing a
 * workspace's own credentials is what makes bring-your-own-Apollo work without
 * a parallel client.
 */
export async function searchPersons(
  params: ApolloSearchParams,
  config?: ApolloConfig,
): Promise<ApolloSearchResult> {
  const perPage = params.per_page ?? 25;
  const page = params.page ?? 1;
  const body: Record<string, unknown> = { page, per_page: perPage };
  if (params.q_keywords) body.q_keywords = params.q_keywords;
  if (params.person_titles?.length) body.person_titles = params.person_titles;
  if (params.person_not_titles?.length) body.person_not_titles = params.person_not_titles;
  if (params.person_seniorities?.length) body.person_seniorities = params.person_seniorities;
  if (params.q_organization_domains_list?.length) body.q_organization_domains_list = params.q_organization_domains_list;
  if (params.organization_locations?.length) body.organization_locations = params.organization_locations;
  if (params.person_locations?.length) body.person_locations = params.person_locations;
  if (params.organization_num_employees_ranges?.length) {
    body.organization_num_employees_ranges = params.organization_num_employees_ranges;
  }
  if (params.contact_email_status?.length) body.contact_email_status = params.contact_email_status;
  if (params.include_similar_titles !== undefined) {
    body.include_similar_titles = params.include_similar_titles;
  }

  type ApolloSearchResponse = {
    people?: ApolloPerson[];
    contacts?: ApolloPerson[];
    total_entries?: number;
    pagination?: { page?: number; per_page?: number; total_pages?: number; total_entries?: number };
  };
  const data = await postJson<ApolloSearchResponse>("/mixed_people/api_search", body, config);
  const rows = [...(data.people ?? []), ...(data.contacts ?? [])];
  const totalEntries = data.total_entries ?? data.pagination?.total_entries ?? rows.length;
  const totalPages = data.pagination?.total_pages ?? Math.ceil(totalEntries / perPage);
  const nextPage = page < totalPages ? page + 1 : null;
  return { rows, total: totalEntries, nextPage };
}

export async function matchPerson(
  id: string,
  options: ApolloMatchOptions,
  config?: ApolloConfig,
): Promise<ApolloPerson> {
  type ApolloMatchResponse = { person?: ApolloPerson; matches?: ApolloPerson[] };
  const data = await postJson<ApolloMatchResponse>(
    "/people/match",
    {
      id,
      reveal_personal_emails: options.reveal_personal_emails ?? false,
      reveal_phone_number: options.reveal_phone_number ?? false,
    },
    config,
  );
  const person = data.person ?? data.matches?.[0];
  if (!person) throw new ApolloError("Apollo did not return a person record", 404, false);
  return person;
}

export async function healthCheck(): Promise<{ ok: true }> {
  await getJson<unknown>("/auth/health");
  return { ok: true };
}

/**
 * Check a key that may not be saved yet.
 *
 * Runs the smallest real search rather than /auth/health: a key can authenticate
 * and still be unusable because the plan has no search access left, and finding
 * that out at 07:00 during a drip run is too late. Costs no Apollo credits —
 * only reveals do.
 */
export async function testCredentials(
  config: ApolloConfig,
): Promise<{ ok: true; total: number }> {
  const result = await postJson<{ pagination?: { total_entries?: number } }>(
    "/mixed_people/api_search",
    { page: 1, per_page: 1, person_seniorities: ["owner"] },
    config,
  );
  return { ok: true, total: result.pagination?.total_entries ?? 0 };
}
