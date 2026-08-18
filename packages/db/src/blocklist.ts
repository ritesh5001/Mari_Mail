import type { Prisma } from "@prisma/client";
import { prisma } from "./index.js";

/**
 * Excludes a workspace's blocked people from a Contact query.
 *
 * A WHERE CLAUSE rather than a post-filter, deliberately. Contact and list
 * queries paginate, count and sort in the database; dropping rows after the
 * fact would return short pages and totals that disagree with what is on
 * screen. This way a blocked person is simply not part of the result set.
 *
 * Lives in the db package so BOTH stacks can use it: the API server and the
 * Next server components in `client/src/lib/contact-data.ts`, which query
 * Prisma directly and are a completely separate read path. The blocking bug
 * this fixes was precisely that those two paths knew different things.
 *
 * Matching mirrors the in-memory matcher in the server's blocklist service:
 * CONTACT blocks match an exact address, COMPANY blocks match the email's
 * domain or the company name. Both read the same stored `value`.
 */
export async function blockedContactWhere(
  workspaceId: string,
): Promise<Prisma.ContactWhereInput | null> {
  const blocks = await prisma.workspaceBlock.findMany({
    where: { workspaceId },
    select: { kind: true, value: true },
  });
  if (blocks.length === 0) return null;

  const emails: string[] = [];
  const companies: string[] = [];
  for (const block of blocks) {
    if (block.kind === "CONTACT") emails.push(block.value);
    else companies.push(block.value);
  }

  const clauses: Prisma.ContactWhereInput[] = [];
  if (emails.length > 0) {
    clauses.push({ email: { in: emails, mode: "insensitive" } });
  }
  for (const company of companies) {
    // A company value is either a domain ("acme-shipping.com") or a normalised
    // name ("acme shipping"). Domains are matched on the address suffix, which
    // is exact; names fall back to containment because the stored contact keeps
    // the suffixes ("Ltd", "Shipping") that normalisation strips.
    if (company.includes(".")) {
      clauses.push({ email: { endsWith: `@${company}`, mode: "insensitive" } });
      // `website` is nullable, and this whole OR sits inside a NOT. In SQL's
      // three-valued logic `NULL LIKE '%x%'` is NULL, `FALSE OR NULL` is NULL,
      // and `NOT NULL` is NULL — which excludes the row. So a single domain
      // block would have hidden every contact with no website, i.e. most of
      // them. The explicit null check keeps the expression boolean.
      clauses.push({
        AND: [{ website: { not: null } }, { website: { contains: company, mode: "insensitive" } }],
      });
    } else {
      clauses.push({ companyName: { contains: company, mode: "insensitive" } });
    }
  }
  if (clauses.length === 0) return null;

  return { NOT: { OR: clauses } };
}

/**
 * Folds the exclusion into an existing where clause.
 *
 * Returns the original untouched when the workspace has no blocks, so the
 * common case adds no clause at all.
 */
export async function withoutBlockedContacts(
  workspaceId: string,
  where: Prisma.ContactWhereInput,
): Promise<Prisma.ContactWhereInput> {
  const exclusion = await blockedContactWhere(workspaceId);
  return exclusion ? { AND: [where, exclusion] } : where;
}
