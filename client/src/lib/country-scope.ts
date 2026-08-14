/**
 * Country access control, shared by Port Radar (`eta-data`) and Vessels
 * (`marine-data`).
 *
 * It lives in its own module rather than in either consumer because
 * `eta-data` already imports `buildVesselFilterClauses` from `marine-data`,
 * and having `marine-data` reach back for the clamp would close an import
 * cycle. It is also the security boundary for paid country access, so it
 * should be one obvious file rather than a helper buried in a query module.
 */

/** A country restriction: one country (legacy), many (plan allowlist), or none. */
export type CountryScope = string | string[] | null | undefined;

/**
 * Normalises any scope to a plain array, or `null` for "unrestricted".
 *
 * An EMPTY array is preserved, not collapsed to `null`. `[]` means "this
 * workspace is granted no country", which must match nothing; collapsing it to
 * `null` said the opposite ("no restriction") and handed the caller every
 * country in the database. `resolveCountryFilter` documents the same rule for
 * its return value — this is the input side of it.
 */
export function scopeToList(scope: CountryScope): string[] | null {
  if (Array.isArray(scope)) return scope;
  return scope ? [scope] : null;
}

/**
 * Intersects the countries the user ASKED for with the countries their plan
 * GRANTS. This is the only correct way to combine the two.
 *
 * Both call sites previously replaced the grant with the request whenever the
 * request was non-empty (`filterCountries.length > 0 ? null : grantClause`),
 * on the theory that ANDing them "would filter everything out". It doesn't —
 * it empties the result only when someone asks for a country they haven't paid
 * for, which is exactly what should happen. As written it was a plan bypass: a
 * Brazil+India workspace hitting `?destCountry=US` had its allowlist dropped
 * and saw US arrivals, reachable from the URL bar and from the feed API.
 *
 * An empty return array is meaningful and must be preserved — it means "you
 * asked only for countries you don't have", and the clause builders turn it
 * into a match-nothing filter. Collapsing it to `null` reopens the hole.
 */
export function resolveCountryFilter(requested: string[], scope: CountryScope): CountryScope {
  const allowed = scopeToList(scope);
  // Unscoped workspace (or super-admin, who passes scope=null): honour the
  // request as-is. There is no grant to intersect against.
  if (!allowed) return requested.length > 0 ? requested : null;
  if (requested.length === 0) return allowed;
  return requested.filter((country) => allowed.includes(country));
}

/** Reads and validates `?destCountry=BR,IN` from a Next.js query bag. */
export function requestedCountries(
  searchParams: Record<string, string | string[] | undefined>,
): string[] {
  const raw = searchParams.destCountry;
  const parts = Array.isArray(raw)
    ? raw.flatMap((v) => v.split(","))
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  return parts
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

/**
 * Resolves the scope a workspace should be read at, given its session values.
 * Prefers the plan's multi-country allowlist (chosen at signup), then the
 * legacy single `targetPortCountry`.
 *
 * FAILS CLOSED. A workspace with neither recorded is granted NO country and
 * gets `[]` — a match-nothing scope — not `null`.
 *
 * It used to return `null` (unrestricted) in that case, on the reading that an
 * unscoped workspace is a legacy one that predates country grants. In practice
 * it is the default state of every workspace whose owner skipped the country
 * step at signup, and those workspaces read the entire global ETA table: a
 * Starter plan that grants one country showed arrivals in ten. Country access
 * is a priced feature, so the absence of a grant has to mean none, and the
 * empty state routes the user to `TargetCountryBanner` to pick their country.
 *
 * Callers that legitimately see everything — super-admins — pass `null`
 * explicitly instead of relying on this returning it.
 */
export function workspaceCountryScope(workspace: {
  allowedCountries?: string[] | null;
  targetPortCountry?: string | null;
}): CountryScope {
  const allowed = workspace.allowedCountries ?? [];
  if (allowed.length > 0) return allowed;
  return workspace.targetPortCountry ? workspace.targetPortCountry : [];
}
