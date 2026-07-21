import { clampPage, clampPageSize } from "@/lib/eta-data";

export type FeedRequest = {
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageSize: number;
};

/**
 * Parses a Port Radar feed page request. The client sends the current filter
 * query string (from window.location.search) plus page/pageSize, so every tab
 * fetch stays scoped by the same filters the SSR page applied. page/pageSize are
 * clamped via the shared eta-data helpers so the API can't be asked for an
 * out-of-range page size.
 */
export async function parseFeedRequest(request: Request): Promise<FeedRequest> {
  const body = (await request.json().catch(() => null)) as {
    search?: unknown;
    page?: unknown;
    pageSize?: unknown;
  } | null;

  const search = typeof body?.search === "string" ? body.search : "";
  const params = new URLSearchParams(search);
  const searchParams: Record<string, string | string[] | undefined> = {};
  for (const key of params.keys()) {
    const all = params.getAll(key);
    searchParams[key] = all.length > 1 ? all : all[0];
  }

  const page = clampPage(body?.page != null ? String(body.page) : undefined);
  const pageSize = clampPageSize(body?.pageSize != null ? String(body.pageSize) : undefined);

  return { searchParams, page, pageSize };
}
