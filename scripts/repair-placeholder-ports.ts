/**
 * Repairs ETAs stranded on placeholder ports.
 *
 * When a CSV destination didn't match the port registry, the importer invented
 * a Port row with country "XX"/Unknown. Port Radar filters by `port.country`,
 * so every ETA pointing at one of those placeholders is invisible to a country
 * filter — a Qatar workspace saw 7 arrivals when the upload had far more.
 *
 * Many of those placeholders duplicate a port that was already on file
 * ("Aratu" ⇄ BRARB "Aratu", "Halul Island" ⇄ QAHAL "Halul"). This remaps their
 * ETAs onto the real port and deletes the placeholder.
 *
 *   pnpm --filter @marimail/db exec tsx scripts/repair-placeholder-ports.ts
 *   pnpm --filter @marimail/db exec tsx scripts/repair-placeholder-ports.ts --apply
 *
 * Dry-run by default: prints the plan and changes nothing.
 */
import { prisma } from "@marimail/db";

const UNKNOWN = "XX";
const APPLY = process.argv.includes("--apply");
/** Also delete placeholder Port rows left empty by the remap. Opt-in. */
const PRUNE = process.argv.includes("--prune");

function normalize(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Same alias set the resolver indexes by — keep these two in step. */
function keysFor(portCode: string, portName: string): string[] {
  const keys = new Set<string>();
  const add = (v: string | undefined) => {
    const n = v ? normalize(v) : "";
    if (n) keys.add(n);
  };
  add(portCode);
  add(portName);
  add(portName.split(",")[0]);
  add(portName.split("/")[0]);
  add(portName.split("(")[0]);
  const paren = portName.match(/\(([^)]+)\)/);
  if (paren) add(paren[1]);
  return [...keys];
}

async function main() {
  const ports = await prisma.port.findMany({
    select: { portCode: true, portName: true, country: true },
  });
  const real = ports.filter((p) => p.country !== UNKNOWN);
  const placeholders = ports.filter((p) => p.country === UNKNOWN);

  // alias → EVERY real port carrying it. A name like "Rio Grande" belongs to
  // both ARRGA and BRRIG, and "Mahe" to both India and the Seychelles; keeping
  // all candidates is what makes that collision visible instead of silently
  // resolving to whichever row the database happened to return first.
  const index = new Map<string, (typeof real)[number][]>();
  for (const port of real) {
    for (const key of keysFor(port.portCode, port.portName)) {
      const bucket = index.get(key);
      if (bucket) bucket.push(port);
      else index.set(key, [port]);
    }
  }

  // Optional disambiguator: --country=BR resolves collisions in favour of that
  // country, for a dataset known to cover one place.
  const countryHint = (process.argv.find((a) => a.startsWith("--country="))?.split("=")[1] ?? "")
    .toUpperCase()
    .trim();

  const plan: Array<{ from: string; fromName: string; to: string; toName: string; country: string; etas: number }> = [];
  const ambiguous: Array<{ code: string; name: string; etas: number; candidates: (typeof real)[number][] }> = [];
  const unmatched: Array<{ code: string; name: string; etas: number }> = [];

  for (const ph of placeholders) {
    const etas = await prisma.vesselETA.count({ where: { destinationPort: ph.portCode } });

    const candidates = new Map<string, (typeof real)[number]>();
    for (const key of keysFor(ph.portCode, ph.portName)) {
      for (const port of index.get(key) ?? []) candidates.set(port.portCode, port);
    }
    const found = [...candidates.values()];
    const countries = new Set(found.map((p) => p.country));

    let chosen: (typeof real)[number] | null = null;
    if (found.length === 1) {
      chosen = found[0];
    } else if (countries.size === 1) {
      // Several rows, one country — the country filter can't tell them apart,
      // so any of them is a correct answer. Take the shortest code for stability.
      chosen = [...found].sort((a, b) => a.portCode.localeCompare(b.portCode))[0];
    } else if (countryHint) {
      chosen = found.find((p) => p.country === countryHint) ?? null;
    }

    if (chosen) {
      plan.push({
        from: ph.portCode,
        fromName: ph.portName,
        to: chosen.portCode,
        toName: chosen.portName,
        country: chosen.country,
        etas,
      });
    } else if (found.length > 1 && etas > 0) {
      ambiguous.push({ code: ph.portCode, name: ph.portName, etas, candidates: found });
    } else if (etas > 0) {
      unmatched.push({ code: ph.portCode, name: ph.portName, etas });
    }
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN — pass --apply to commit"}\n`);
  console.log(`placeholder ports: ${placeholders.length}   remappable: ${plan.length}\n`);

  const movable = plan.filter((p) => p.etas > 0).sort((a, b) => b.etas - a.etas);
  console.log("remapping (placeholder → real port):");
  for (const p of movable) {
    console.log(`  ${String(p.etas).padStart(5)} ETAs  ${p.from} "${p.fromName}" → ${p.to} "${p.toName}" [${p.country}]`);
  }
  console.log(`\n  total ETAs recovered: ${movable.reduce((s, p) => s + p.etas, 0)}`);

  if (ambiguous.length) {
    console.log(`\nAMBIGUOUS — the same name exists in more than one country. Left untouched;`);
    console.log(`re-run with --country=XX to resolve these in favour of one country:`);
    for (const a of ambiguous.sort((x, y) => y.etas - x.etas)) {
      const list = a.candidates.map((c) => `${c.portCode} "${c.portName}" [${c.country}]`).join("  |  ");
      console.log(`  ${String(a.etas).padStart(5)} ETAs  ${a.code} "${a.name}"  →  ${list}`);
    }
  }

  if (unmatched.length) {
    console.log(`\nstill unmatched (no registry equivalent — these need a real Port row):`);
    for (const u of unmatched.sort((a, b) => b.etas - a.etas).slice(0, 25)) {
      console.log(`  ${String(u.etas).padStart(5)} ETAs  ${u.code} "${u.name}"`);
    }
    if (unmatched.length > 25) console.log(`  …and ${unmatched.length - 25} more`);
    console.log(`  total ETAs still stranded: ${unmatched.reduce((s, u) => s + u.etas, 0)}`);
  }

  if (!APPLY) {
    console.log("\nNothing written.\n");
    await prisma.$disconnect();
    return;
  }

  let moved = 0;
  let removed = 0;
  for (const p of plan) {
    if (p.etas > 0) {
      // Keep destinationPortName in step with the port row it now points at,
      // so the table label and the country filter agree.
      //
      // Raw SQL, not updateMany, so `updatedAt` survives: it is the only record
      // of which upload last touched a row, and the dedupe pass reads it to
      // decide which of a vessel's ETAs is current. A Prisma update would stamp
      // every remapped row with "now" and make an old row look like the newest.
      const res = await prisma.$executeRaw`
        UPDATE "VesselETA"
        SET "destinationPort" = ${p.to}, "destinationPortName" = ${p.toName}
        WHERE "destinationPort" = ${p.from}`;
      moved += res;
    }
    // Deleting the emptied placeholder is opt-in: PortCampaignRule references
    // portCode with onDelete: NoAction, so a rule pointing at one would make
    // the delete fail (or orphan a rule). Remapping alone already fixes the
    // visibility bug; tidying the rows is a separate, riskier step.
    if (!PRUNE) continue;
    const left = await prisma.vesselETA.count({ where: { destinationPort: p.from } });
    const rules = await prisma.portCampaignRule.count({ where: { portCode: p.from } });
    if (left === 0 && rules === 0) {
      await prisma.port.deleteMany({ where: { portCode: p.from, country: UNKNOWN } });
      removed += 1;
    }
  }

  console.log(`\nmoved ${moved} ETAs onto real ports; deleted ${removed} placeholder port rows.\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
