import { prisma } from "@marimail/db";
import { searchPersons as apolloSearchPersons } from "./apollo/client.js";
import { apolloPersonToContactRow } from "./apollo/mapper.js";
import { getOrCreateApolloSettings } from "./apollo/settings.js";
import { recordQuery as recordApolloQuery } from "./apollo/usage.js";
import { revealApolloPerson } from "../routes/contacts.js";

/**
 * Daily drip of an Apollo people-search filter into a contact list.
 *
 * An Apollo filter routinely matches thousands of people while the page in
 * front of you shows 25. Revealing an email costs a credit, so "add all
 * matches" is neither affordable nor something you can click through by hand.
 * So the FILTER is saved and this runs once a day: replay the search from the
 * stored cursor, reveal up to `dailyLimit` more people, append them to the
 * list, and remember where it stopped.
 *
 * Apollo ranks deterministically for a fixed query, so replaying page N gives
 * back the same slice. `offsetInPage` is what lets a run that stopped mid-page
 * — daily cap reached, credits exhausted — resume without paying twice for
 * anyone.
 */

/** Apollo's max is 100; 25 keeps a stopped run from re-fetching much. */
const PER_PAGE = 25;

/**
 * Apollo refuses to page past ~50k results and gets slower the deeper you go.
 * A drip that somehow ran that far has outlived any useful filter.
 */
const MAX_PAGE = 200;

export type DripRunResult = {
  jobId: string;
  added: number;
  revealed: number;
  skipped: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED";
  stoppedBecause?: string;
};

export async function runApolloDrip(jobId: string): Promise<DripRunResult> {
  const job = await prisma.apolloDripJob.findUnique({ where: { id: jobId } });
  if (!job) return { jobId, added: 0, revealed: 0, skipped: 0, status: "FAILED", stoppedBecause: "not_found" };
  if (job.status !== "ACTIVE") {
    return { jobId, added: 0, revealed: 0, skipped: 0, status: job.status, stoppedBecause: "not_active" };
  }

  const settings = await getOrCreateApolloSettings();
  if (!settings.enabled || !settings.apiKey) {
    await prisma.apolloDripJob.update({
      where: { id: job.id },
      data: { lastRunAt: new Date(), lastError: "Apollo integration is disabled" },
    });
    return { jobId, added: 0, revealed: 0, skipped: 0, status: "ACTIVE", stoppedBecause: "apollo_disabled" };
  }

  const filter = job.filter as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(filter[k]) ? (filter[k] as string[]) : undefined);
  const str = (k: string) => (typeof filter[k] === "string" ? (filter[k] as string) : undefined);

  let page = job.page;
  let offset = job.offsetInPage;
  let added = 0;
  let revealed = 0;
  let skipped = 0;
  let status: DripRunResult["status"] = "ACTIVE";
  let stoppedBecause: string | undefined;
  let lastError: string | null = null;

  while (added < job.dailyLimit) {
    if (page > MAX_PAGE) {
      status = "COMPLETED";
      stoppedBecause = "max_page";
      break;
    }

    let rows: ReturnType<typeof apolloPersonToContactRow>[];
    let hasNextPage: boolean;
    try {
      await recordApolloQuery();
      const result = await apolloSearchPersons({
        person_titles: arr("includeTitles"),
        person_not_titles: arr("excludeTitles"),
        person_seniorities: arr("seniorities"),
        person_locations: arr("personLocations"),
        organization_locations: arr("companyLocations"),
        organization_num_employees_ranges: arr("employeeRanges"),
        contact_email_status: arr("emailStatus"),
        include_similar_titles: filter.includeSimilarTitles === true,
        q_keywords: str("keywords"),
        page,
        per_page: PER_PAGE,
      });
      rows = result.rows.map(apolloPersonToContactRow);
      hasNextPage = Boolean(result.nextPage);
    } catch (err) {
      // Leave the cursor untouched — tomorrow's run retries the same page
      // rather than skipping the people on it.
      lastError = `Apollo search failed: ${(err as Error).message}`;
      stoppedBecause = "apollo_unavailable";
      break;
    }

    if (rows.length === 0) {
      status = "COMPLETED";
      stoppedBecause = "no_more_results";
      break;
    }

    // Reveals run one at a time on purpose. This is a background job with no
    // one waiting, and serial keeps the cursor honest: every increment of
    // `offset` corresponds to a person we have actually finished paying for,
    // so a crash mid-run can't skip anybody.
    let outOfCredits = false;
    for (let i = offset; i < rows.length; i += 1) {
      if (added >= job.dailyLimit) break;
      const person = rows[i];
      offset = i + 1;

      if (!person.externalId) {
        skipped += 1;
        continue;
      }

      const result = await revealApolloPerson("email", person.externalId, job.workspaceId, job.createdById);
      if (result.status !== 200) {
        if (result.code === "INSUFFICIENT_CREDITS") {
          // Stop the whole run and rewind one — we never paid for this person,
          // so tomorrow should try them again rather than skip them.
          offset = i;
          outOfCredits = true;
          lastError = "Out of credits — drip paused until the balance is topped up.";
          break;
        }
        skipped += 1;
        continue;
      }
      revealed += 1;

      const contactId = (result.contact as { id: string }).id;
      const before = await prisma.listContact.findUnique({
        where: { listId_contactId: { listId: job.listId, contactId } },
        select: { id: true },
      });
      if (!before) {
        await prisma.listContact.create({ data: { listId: job.listId, contactId } });
        added += 1;
      } else {
        // Already on the list from an earlier run or a manual add. The reveal
        // still happened (and was still charged), so it counts as revealed but
        // not as added.
        skipped += 1;
      }
    }

    if (outOfCredits) {
      stoppedBecause = "insufficient_credits";
      break;
    }

    if (offset >= rows.length) {
      if (!hasNextPage) {
        status = "COMPLETED";
        stoppedBecause = "no_more_results";
        // Park the cursor at the end so a resumed run doesn't re-read.
        break;
      }
      page += 1;
      offset = 0;
    }
  }

  if (added > 0) {
    await prisma.contactList.update({
      where: { id: job.listId },
      data: { contactCount: { increment: added } },
    });
  }

  await prisma.apolloDripJob.update({
    where: { id: job.id },
    data: {
      page,
      offsetInPage: offset,
      status,
      revealed: { increment: revealed },
      added: { increment: added },
      skipped: { increment: skipped },
      lastRunAt: new Date(),
      lastRunAdded: added,
      lastError,
    },
  });

  console.log(
    `[apollo-drip] job=${job.id} list=${job.listId}: +${added} added, ${revealed} revealed, ${skipped} skipped, cursor page=${page}/${offset}, status=${status}${
      stoppedBecause ? ` (${stoppedBecause})` : ""
    }`,
  );

  return { jobId, added, revealed, skipped, status, stoppedBecause };
}

/** Runs every ACTIVE drip. Called by the daily cron. */
export async function runAllApolloDrips(): Promise<{ jobs: number; added: number }> {
  const jobs = await prisma.apolloDripJob.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let added = 0;
  for (const { id } of jobs) {
    try {
      const result = await runApolloDrip(id);
      added += result.added;
    } catch (err) {
      // One bad drip must not stop the rest of the sweep.
      console.warn(`[apollo-drip] job=${id} threw: ${(err as Error).message}`);
      await prisma.apolloDripJob
        .update({ where: { id }, data: { lastError: (err as Error).message, lastRunAt: new Date() } })
        .catch(() => undefined);
    }
  }
  return { jobs: jobs.length, added };
}
