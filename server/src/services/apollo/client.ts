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

type ApolloConfig = { baseUrl: string; apiKey: string };

async function getConfig(): Promise<ApolloConfig> {
  const settings = await getOrCreateApolloSettings();
  if (!settings.enabled) throw new ApolloError("Apollo integration is disabled", undefined, false);
  const decrypted = decryptJsonSecret<{ apiKey: string }>(settings.apiKey);
  const apiKey = decrypted?.apiKey?.trim();
  if (!apiKey) throw new ApolloError("Apollo API key is not configured", undefined, false);
  const baseUrl = (settings.apiBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { baseUrl, apiKey };
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl, apiKey } = await getConfig();
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

  if (response.status >= 500) {
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

export async function searchPersons(params: ApolloSearchParams): Promise<ApolloSearchResult> {
  const perPage = params.per_page ?? 25;
  const page = params.page ?? 1;
  const body: Record<string, unknown> = { page, per_page: perPage };
  if (params.q_keywords) body.q_keywords = params.q_keywords;
  if (params.person_titles?.length) body.person_titles = params.person_titles;
  if (params.person_not_titles?.length) body.person_not_titles = params.person_not_titles;
  if (params.person_seniorities?.length) body.person_seniorities = params.person_seniorities;
  if (params.q_organization_domains_list?.length) body.q_organization_domains_list = params.q_organization_domains_list;
  if (params.organization_locations?.length) body.organization_locations = params.organization_locations;

  type ApolloSearchResponse = {
    people?: ApolloPerson[];
    contacts?: ApolloPerson[];
    total_entries?: number;
    pagination?: { page?: number; per_page?: number; total_pages?: number; total_entries?: number };
  };
  const data = await postJson<ApolloSearchResponse>("/mixed_people/api_search", body);
  const rows = [...(data.people ?? []), ...(data.contacts ?? [])];
  const totalEntries = data.total_entries ?? data.pagination?.total_entries ?? rows.length;
  const totalPages = data.pagination?.total_pages ?? Math.ceil(totalEntries / perPage);
  const nextPage = page < totalPages ? page + 1 : null;
  return { rows, total: totalEntries, nextPage };
}

export async function matchPerson(id: string, options: ApolloMatchOptions): Promise<ApolloPerson> {
  type ApolloMatchResponse = { person?: ApolloPerson; matches?: ApolloPerson[] };
  const data = await postJson<ApolloMatchResponse>("/people/match", {
    id,
    reveal_personal_emails: options.reveal_personal_emails ?? false,
    reveal_phone_number: options.reveal_phone_number ?? false,
  });
  const person = data.person ?? data.matches?.[0];
  if (!person) throw new ApolloError("Apollo did not return a person record", 404, false);
  return person;
}

export async function healthCheck(): Promise<{ ok: true }> {
  await getJson<unknown>("/auth/health");
  return { ok: true };
}
