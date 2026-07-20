const TIMEOUT_MS = 8_000;

export type MaribizPerson = {
  id: number;
  person_name: string | null;
  person_first_name: string | null;
  person_last_name: string | null;
  person_title: string | null;
  person_seniority: string | null;
  person_email_status: string | null;
  email_confidence: number | null;
  person_email: string | null;
  person_phone: string | null;
  person_sanitized_phone: string | null;
  person_linkedin_url: string | null;
  person_detailed_function: string | null;
  organization_name: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  person_vacuumed_at: string | null;
  created_at: string | null;
};

export type MaribizSearchParams = {
  q?: string;
  limit?: number;
  cursor?: string;
};

export type MaribizSearchResult = {
  rows: MaribizPerson[];
  nextCursor: string | null;
  total: { kind: "estimate" | "capped" | "exact"; value: number };
};

export type MaribizStats = {
  totalRows: number;
  disk: { total: string; table: string; indexes: string };
  topCountries: Array<{ value: string; count: number }>;
};

export class MaribizError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MaribizError";
  }
}

function getConfig() {
  const baseUrl = process.env.MARIBIZ_API_URL?.trim();
  const apiKey = process.env.MARIBIZ_API_KEY?.trim();
  if (!baseUrl) throw new MaribizError("MARIBIZ_API_URL is not configured");
  if (!apiKey) throw new MaribizError("MARIBIZ_API_KEY is not configured");
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function getJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
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
      throw new MaribizError("Maribiz request timed out", undefined, true);
    }
    throw new MaribizError(`Maribiz network error: ${(error as Error).message}`, undefined, true);
  }

  if (response.status >= 500) {
    try {
      response = await attempt();
    } catch (error) {
      throw new MaribizError(`Maribiz retry failed: ${(error as Error).message}`, response.status, true);
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const retryable = response.status >= 500 || response.status === 429;
    throw new MaribizError(
      `Maribiz ${response.status}: ${body.slice(0, 200) || response.statusText}`,
      response.status,
      retryable,
    );
  }

  return (await response.json()) as T;
}

export async function searchPersons(params: MaribizSearchParams): Promise<MaribizSearchResult> {
  return getJson<MaribizSearchResult>("/persons", {
    q: params.q,
    limit: params.limit,
    cursor: params.cursor,
  });
}

export async function getPerson(id: number | string): Promise<MaribizPerson> {
  const response = await getJson<{ person: MaribizPerson }>(`/persons/${encodeURIComponent(String(id))}`);
  return response.person;
}

export async function getStats(): Promise<MaribizStats> {
  return getJson<MaribizStats>("/stats");
}
