/**
 * Imports the canonical UN/LOCODE port + country list from
 * `prisma/port-codes.csv` into the Port table, making that CSV the single
 * source of truth for ports and countries platform-wide (registration country
 * picker, Port Radar country scope, destination-port filters).
 *
 * CSV columns: UnLoc, Country, Place Code, Place Name, Port
 *   - portCode    = UnLoc            (e.g. "AEABU")
 *   - country     = UnLoc[0..2]      (2-letter ISO code, e.g. "AE")
 *   - countryName = cleaned Country  (title-cased, "(THE)" stripped)
 *   - portName    = Place Name
 *   - region      = derived from the country code (CSV has no region)
 *
 * Upsert semantics (per the chosen strategy): CSV wins on name/country/region,
 * but existing rows KEEP their latitude/longitude, portType and defaultServices
 * (the seed's curated coords/services aren't in the CSV, so we don't clobber
 * them). Only rows with Port=TRUE are imported.
 *
 * Run with:  pnpm --filter @marimail/db exec tsx prisma/import-ports.ts
 *            (add `--dry` to preview counts without writing)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../src/index.js";
import type { PortRegion } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "port-codes.csv");

// Country (ISO-2) → PortRegion. Covers every country code present in the CSV.
// Legacy/uncommon codes (AN Netherlands Antilles, CS Serbia-Montenegro, XZ
// international waters) fall back to a best-effort region.
const COUNTRY_REGION: Record<string, PortRegion> = {
  // Middle East
  AE: "MIDDLE_EAST", BH: "MIDDLE_EAST", IL: "MIDDLE_EAST", IQ: "MIDDLE_EAST",
  IR: "MIDDLE_EAST", JO: "MIDDLE_EAST", KW: "MIDDLE_EAST", LB: "MIDDLE_EAST",
  OM: "MIDDLE_EAST", QA: "MIDDLE_EAST", SA: "MIDDLE_EAST", SY: "MIDDLE_EAST",
  TR: "MIDDLE_EAST", YE: "MIDDLE_EAST",
  // Indian subcontinent
  IN: "INDIAN_SUBCONTINENT", PK: "INDIAN_SUBCONTINENT", BD: "INDIAN_SUBCONTINENT",
  LK: "INDIAN_SUBCONTINENT", MV: "INDIAN_SUBCONTINENT", NP: "INDIAN_SUBCONTINENT",
  AF: "INDIAN_SUBCONTINENT",
  // Southeast Asia
  SG: "SOUTHEAST_ASIA", MY: "SOUTHEAST_ASIA", TH: "SOUTHEAST_ASIA",
  ID: "SOUTHEAST_ASIA", PH: "SOUTHEAST_ASIA", VN: "SOUTHEAST_ASIA",
  MM: "SOUTHEAST_ASIA", KH: "SOUTHEAST_ASIA", BN: "SOUTHEAST_ASIA",
  TL: "SOUTHEAST_ASIA", LA: "SOUTHEAST_ASIA",
  // East Asia
  CN: "EAST_ASIA", HK: "EAST_ASIA", JP: "EAST_ASIA", KR: "EAST_ASIA",
  KP: "EAST_ASIA", TW: "EAST_ASIA", MO: "EAST_ASIA", MN: "EAST_ASIA",
  // Europe
  GB: "EUROPE", IE: "EUROPE", FR: "EUROPE", DE: "EUROPE", NL: "EUROPE",
  BE: "EUROPE", LU: "EUROPE", ES: "EUROPE", PT: "EUROPE", IT: "EUROPE",
  GR: "EUROPE", CY: "EUROPE", MT: "EUROPE", DK: "EUROPE", SE: "EUROPE",
  NO: "EUROPE", FI: "EUROPE", IS: "EUROPE", PL: "EUROPE", CZ: "EUROPE",
  SK: "EUROPE", AT: "EUROPE", CH: "EUROPE", HU: "EUROPE", RO: "EUROPE",
  BG: "EUROPE", HR: "EUROPE", SI: "EUROPE", BA: "EUROPE", RS: "EUROPE",
  CS: "EUROPE", ME: "EUROPE", MK: "EUROPE", AL: "EUROPE", EE: "EUROPE",
  LV: "EUROPE", LT: "EUROPE", UA: "EUROPE", RU: "EUROPE", GE: "EUROPE",
  AZ: "EUROPE", MC: "EUROPE", GI: "EUROPE", FO: "EUROPE", GL: "EUROPE",
  SJ: "EUROPE", KZ: "EUROPE", TM: "EUROPE",
  // Americas
  US: "AMERICAS", CA: "AMERICAS", MX: "AMERICAS", BR: "AMERICAS",
  AR: "AMERICAS", CL: "AMERICAS", PE: "AMERICAS", CO: "AMERICAS",
  VE: "AMERICAS", EC: "AMERICAS", BO: "AMERICAS", PY: "AMERICAS",
  UY: "AMERICAS", GY: "AMERICAS", SR: "AMERICAS", GF: "AMERICAS",
  PA: "AMERICAS", CR: "AMERICAS", NI: "AMERICAS", HN: "AMERICAS",
  SV: "AMERICAS", GT: "AMERICAS", BZ: "AMERICAS", CU: "AMERICAS",
  DO: "AMERICAS", HT: "AMERICAS", JM: "AMERICAS", TT: "AMERICAS",
  BS: "AMERICAS", BB: "AMERICAS", AG: "AMERICAS", DM: "AMERICAS",
  GD: "AMERICAS", KN: "AMERICAS", LC: "AMERICAS", VC: "AMERICAS",
  PR: "AMERICAS", VI: "AMERICAS", VG: "AMERICAS", AI: "AMERICAS",
  AW: "AMERICAS", AN: "AMERICAS", KY: "AMERICAS", TC: "AMERICAS",
  BM: "AMERICAS", GP: "AMERICAS", MQ: "AMERICAS", MS: "AMERICAS",
  PM: "AMERICAS", FK: "AMERICAS", GS: "AMERICAS",
  // Africa
  ZA: "AFRICA", NG: "AFRICA", EG: "AFRICA", MA: "AFRICA", DZ: "AFRICA",
  TN: "AFRICA", LY: "AFRICA", KE: "AFRICA", TZ: "AFRICA", GH: "AFRICA",
  CI: "AFRICA", SN: "AFRICA", CM: "AFRICA", AO: "AFRICA", MZ: "AFRICA",
  NA: "AFRICA", CG: "AFRICA", CD: "AFRICA", GA: "AFRICA", GQ: "AFRICA",
  BJ: "AFRICA", TG: "AFRICA", LR: "AFRICA", SL: "AFRICA", GN: "AFRICA",
  GW: "AFRICA", GM: "AFRICA", MR: "AFRICA", CV: "AFRICA", ST: "AFRICA",
  DJ: "AFRICA", ER: "AFRICA", SO: "AFRICA", SD: "AFRICA", MU: "AFRICA",
  SC: "AFRICA", MG: "AFRICA", KM: "AFRICA", RE: "AFRICA", YT: "AFRICA",
  SH: "AFRICA", EH: "AFRICA", BW: "AFRICA", SZ: "AFRICA", ZM: "AFRICA",
  BI: "AFRICA", UG: "AFRICA",
  // Oceania
  AU: "OCEANIA", NZ: "OCEANIA", PG: "OCEANIA", FJ: "OCEANIA", NC: "OCEANIA",
  PF: "OCEANIA", SB: "OCEANIA", VU: "OCEANIA", WS: "OCEANIA", TO: "OCEANIA",
  KI: "OCEANIA", TV: "OCEANIA", NR: "OCEANIA", FM: "OCEANIA", MH: "OCEANIA",
  PW: "OCEANIA", CK: "OCEANIA", NU: "OCEANIA", TK: "OCEANIA", AS: "OCEANIA",
  GU: "OCEANIA", MP: "OCEANIA", WF: "OCEANIA", PN: "OCEANIA", CX: "OCEANIA",
  CC: "OCEANIA", NF: "OCEANIA", UM: "OCEANIA", HM: "OCEANIA", AQ: "OCEANIA",
};

const FALLBACK_REGION: PortRegion = "EUROPE";

/** Title-case a screaming-caps country name and strip UN/LOCODE's "(THE)". */
function cleanCountryName(raw: string): string {
  const stripped = raw.replace(/\s*\(THE\)\s*$/i, "").trim();
  return stripped
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    // Keep common uppercase abbreviations readable.
    .replace(/\bUsa\b/g, "USA")
    .replace(/\bUk\b/g, "UK")
    .replace(/\bUae\b/g, "UAE");
}

/** Minimal RFC-4180-ish CSV line parser (handles quoted fields with commas). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type Row = {
  portCode: string;
  country: string;
  countryName: string;
  portName: string;
  region: PortRegion;
};

function loadRows(): Row[] {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  lines.shift(); // header
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [unLoc, countryRaw, , placeName, isPort] = parseCsvLine(line);
    if (!unLoc || unLoc.length < 5) continue;
    if (isPort && isPort.toUpperCase() !== "TRUE") continue; // ports only
    const portCode = unLoc.toUpperCase();
    if (seen.has(portCode)) continue; // de-dupe on portCode (it's @unique)
    const country = portCode.slice(0, 2);
    // XZ = international waters / offshore installations (no country name);
    // not a selectable country, so skip it.
    if (country === "XZ" || !countryRaw.trim()) continue;
    seen.add(portCode);
    rows.push({
      portCode,
      country,
      countryName: cleanCountryName(countryRaw),
      portName: placeName || portCode,
      region: COUNTRY_REGION[country] ?? FALLBACK_REGION,
    });
  }
  return rows;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows = loadRows();
  const countries = new Set(rows.map((r) => r.country));
  const unmapped = [...countries].filter((c) => !(c in COUNTRY_REGION));

  console.log(`[import-ports] parsed ${rows.length} ports across ${countries.size} countries`);
  if (unmapped.length) {
    console.log(`[import-ports] ${unmapped.length} unmapped country codes → ${FALLBACK_REGION}: ${unmapped.join(", ")}`);
  }
  if (dry) {
    console.log("[import-ports] --dry: no writes. Sample:");
    console.table(rows.slice(0, 5));
    return;
  }

  // Fast path: bulk-insert everything with createMany(skipDuplicates) so the
  // ~10.7k rows land in a handful of round-trips, then bulk-update the rows that
  // already existed (createMany skipped them) to enforce "CSV wins on
  // name/country/region" while preserving their coords/services.
  const CHUNK = 1000;

  // 1) Insert all rows; existing portCodes are skipped (no coords/services set,
  //    so new ports get null/empty — exactly as intended).
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const res = await prisma.port.createMany({
      data: batch.map((r) => ({
        portCode: r.portCode,
        portName: r.portName,
        country: r.country,
        countryName: r.countryName,
        region: r.region,
      })),
      skipDuplicates: true,
    });
    inserted += res.count;
    console.log(`[import-ports] insert batch ${Math.min(i + CHUNK, rows.length)}/${rows.length} (+${res.count} new)`);
  }

  // 2) Refresh name/country/region on rows that already existed. Run updates in
  //    parallel batches (much faster than sequential) — coords/services are not
  //    touched, so curated data is preserved.
  const skipped = rows.length - inserted;
  let updated = 0;
  if (skipped > 0) {
    const PAR = 40; // concurrent updates per wave
    for (let i = 0; i < rows.length; i += PAR) {
      const wave = rows.slice(i, i + PAR);
      await Promise.all(
        wave.map((r) =>
          prisma.port.update({
            where: { portCode: r.portCode },
            data: {
              portName: r.portName,
              country: r.country,
              countryName: r.countryName,
              region: r.region,
            },
          }),
        ),
      );
      updated += wave.length;
      if (updated % 2000 < PAR) console.log(`[import-ports] refresh ${updated}/${rows.length}`);
    }
  }
  console.log(`[import-ports] done — ${inserted} inserted, ${rows.length} refreshed (${skipped} pre-existing).`);
}

main()
  .catch((err) => {
    console.error("[import-ports] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
