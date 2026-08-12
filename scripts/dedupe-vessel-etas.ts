/**
 * Collapses duplicate ETAs so Port Radar lists each ship once.
 *
 * A ship's declared destination and arrival time change constantly while it is
 * under way. The CSV importer used to key ETAs on (vessel, destinationPort), so
 * every upload that carried a new port left the previous row in place and the
 * radar showed the same ship two or three times, each with a different stale
 * ETA. The importer now keeps one current voyage per vessel; this cleans up the
 * rows the old behaviour already created.
 *
 * The survivor is the most recently UPDATED row — that is the one the latest
 * upload touched. Campaign triggers on the losing rows are repointed onto the
 * survivor rather than deleted with it (VesselETA cascades to ETATrigger), so
 * no campaign loses its enrolment.
 *
 *   pnpm --filter @marimail/db exec tsx scripts/dedupe-vessel-etas.ts
 *   pnpm --filter @marimail/db exec tsx scripts/dedupe-vessel-etas.ts --apply
 *
 * Run repair-placeholder-ports.ts FIRST. Some duplicate pairs are the same
 * physical port under two codes (SANTOS placeholder vs BRSSZ registry entry);
 * repairing those first means the pair collapses to the real port instead of
 * whichever row happens to be newer keeping the placeholder alive.
 *
 * By default only FUTURE ETAs are collapsed — those are the rows the radar
 * duplicates, and past rows are a record of completed voyages. Pass --all to
 * reduce every vessel to a single latest ETA, discarding that history.
 *
 * Dry-run by default: prints the plan and changes nothing.
 */
import { prisma } from "@marimail/db";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

async function main() {
  const where = ALL ? {} : { eta: { gte: new Date() } };

  const etas = await prisma.vesselETA.findMany({
    where,
    select: {
      id: true,
      vesselId: true,
      destinationPort: true,
      destinationPortName: true,
      eta: true,
      createdAt: true,
      updatedAt: true,
      vessel: { select: { vesselName: true, imoNumber: true } },
    },
  });

  const byVessel = new Map<string, typeof etas>();
  for (const eta of etas) {
    const bucket = byVessel.get(eta.vesselId);
    if (bucket) bucket.push(eta);
    else byVessel.set(eta.vesselId, [eta]);
  }

  const dupes = [...byVessel.values()].filter((rows) => rows.length > 1);

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — pass --apply to commit"}`);
  console.log(`scope: ${ALL ? "ALL ETAs" : "future ETAs only"}\n`);
  console.log(`vessels with duplicates: ${dupes.length}`);
  console.log(`rows to remove:          ${dupes.reduce((s, r) => s + r.length - 1, 0)}\n`);

  let removed = 0;
  let movedTriggers = 0;
  let droppedTriggers = 0;

  for (const rows of dupes) {
    // Most recently touched by an upload wins; ETA and creation time break ties.
    const [winner, ...losers] = [...rows].sort(
      (a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        b.eta.getTime() - a.eta.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

    console.log(`${winner.vessel.vesselName} (${winner.vessel.imoNumber})`);
    console.log(
      `   keep  ${winner.destinationPort.padEnd(14)} eta ${winner.eta.toISOString().slice(0, 16)}  updated ${winner.updatedAt.toISOString().slice(0, 10)}`,
    );
    for (const l of losers) {
      console.log(
        `   drop  ${l.destinationPort.padEnd(14)} eta ${l.eta.toISOString().slice(0, 16)}  updated ${l.updatedAt.toISOString().slice(0, 10)}`,
      );
    }

    if (!APPLY) continue;

    for (const loser of losers) {
      const triggers = await prisma.eTATrigger.findMany({
        where: { vesselEtaId: loser.id },
        select: { id: true, campaignId: true },
      });

      for (const trigger of triggers) {
        // (campaignId, vesselEtaId) is unique, so a campaign that already has a
        // trigger on the survivor can't take a second one — drop the duplicate
        // instead of failing the whole cleanup.
        const clash = await prisma.eTATrigger.findFirst({
          where: { campaignId: trigger.campaignId, vesselEtaId: winner.id },
          select: { id: true },
        });
        if (clash) {
          await prisma.eTATrigger.delete({ where: { id: trigger.id } });
          droppedTriggers += 1;
        } else {
          await prisma.eTATrigger.update({
            where: { id: trigger.id },
            data: { vesselEtaId: winner.id, portCode: winner.destinationPort },
          });
          movedTriggers += 1;
        }
      }

      await prisma.vesselETA.delete({ where: { id: loser.id } });
      removed += 1;
    }
  }

  if (APPLY) {
    console.log(
      `\nremoved ${removed} duplicate ETAs; repointed ${movedTriggers} campaign trigger(s), dropped ${droppedTriggers} redundant.\n`,
    );
  } else {
    console.log("\nNothing written.\n");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
