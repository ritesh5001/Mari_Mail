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

/** Normalises any scope to a plain array, or `null` for "unrestricted". */
export function scopeToList(scope: CountryScope): string[] | null {
  if (Array.isArray(scope)) return scope.length > 0 ? scope : null;
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
 * legacy single `targetPortCountry`, then null (unrestricted).
 */
export function workspaceCountryScope(workspace: {
  allowedCountries?: string[] | null;
  targetPortCountry?: string | null;
}): CountryScope {
  const allowed = workspace.allowedCountries ?? [];
  return allowed.length > 0 ? allowed : workspace.targetPortCountry;
}
