#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { DataSource, PrismaClient, VesselType } from '@prisma/client';

type CsvRow = Record<string, string>;

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      currentRow.push(currentField);
      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? '').trim();
    });
    return record;
  });
}

function cleanText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanInt(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseInt(trimmed.replace(/,/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanFloat(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number.parseFloat(trimmed.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function mapVesselType(detailed: string | undefined): VesselType {
  const normalized = detailed?.trim().toLowerCase();
  if (!normalized) {
    return VesselType.OTHER;
  }

  if (normalized.includes('bulk')) return VesselType.BULK_CARRIER;
  if (normalized.includes('crude')) return VesselType.TANKER_CRUDE;
  if (normalized.includes('chemical')) return VesselType.TANKER_CHEMICAL;
  if (normalized.includes('lpg')) return VesselType.TANKER_LPG;
  if (normalized.includes('lng')) return VesselType.TANKER_LNG;
  if (normalized.includes('product') || normalized.includes('tanker')) return VesselType.TANKER_PRODUCT;
  if (normalized.includes('container')) return VesselType.CONTAINER;
  if (normalized.includes('ro-ro') || normalized.includes('roro')) return VesselType.RORO;
  if (normalized.includes('general cargo')) return VesselType.GENERAL_CARGO;
  if (normalized.includes('ferry')) return VesselType.FERRY;
  if (normalized.includes('cruise') || normalized.includes('passenger')) return VesselType.CRUISE;
  if (normalized.includes('dredger')) return VesselType.DREDGER;
  if (normalized.includes('heavy lift')) return VesselType.HEAVY_LIFT;
  if (normalized.includes('barge')) return VesselType.BARGE;
  if (normalized.includes('supply')) return VesselType.SUPPLY_BOAT;
  if (normalized.includes('research')) return VesselType.RESEARCH;
  if (normalized.includes('offshore')) return VesselType.OFFSHORE_PSV;

  return VesselType.OTHER;
}

function readCsvPath(): string {
  const cliPath = process.argv[2];
  if (cliPath) {
    return path.resolve(cliPath);
  }
  return '/Users/ritesh5001/Downloads/Marine Traffic (1).csv';
}

async function main() {
  const csvPath = readCsvPath();
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);
  if (rows.length === 0) {
    console.error('No vessel rows found in CSV');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    console.log(`Found ${rows.length} vessel rows to upload`);

    const batchSize = 250;
    let inserted = 0;

    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      const data = batch
        .map((row) => {
          const imoNumber = cleanText(row.Imo);
          const vesselName = cleanText(row['Vessel Name']);

          if (!imoNumber || !/^\d{7}$/.test(imoNumber) || !vesselName) {
            return null;
          }

          return {
            imoNumber,
            vesselName,
            mmsi: cleanText(row.Mmsi),
            callsign: cleanText(row.Callsign),
            flag: cleanText(row.Flag),
            vesselType: mapVesselType(row['Vessel Type - Detailed']),
            globalArea: cleanText(row['Global Area']),
            eni: cleanText(row.Eni),
            speed: cleanFloat(row.Speed),
            course: cleanFloat(row.Course),
            draught: cleanFloat(row.Draught),
            navigationalStatus: cleanText(row['Navigational Status']),
            destination: cleanText(row.Destination),
            aisClass: cleanText(row['Ais Class']),
            dwt: cleanInt(row['Capacity - Dwt']),
            grossTonnage: cleanInt(row['Capacity - Gt']),
            builtYear: cleanInt(row.Built),
            lengthOverall: cleanFloat(row['Length Overall']),
            breadth: cleanFloat(row.Width),
            width: cleanFloat(row.Width),
            draughtMax: cleanFloat(row['Draught Max']),
            draughtMin: cleanFloat(row['Draught Min']),
            yardNumber: cleanText(row['Yard Number']),
            vesselTypeDetailed: cleanText(row['Vessel Type - Detailed']),
            capacityDwt: cleanInt(row['Capacity - Dwt']),
            capacityGt: cleanInt(row['Capacity - Gt']),
            capacityTeu: cleanInt(row['Capacity - Teu']),
            capacityLiquidGas: cleanInt(row['Capacity - Liquid Gas']),
            capacityPassengers: cleanInt(row['Capacity - Passengers']),
            lengthBetweenPerpendiculars: cleanFloat(row['Length Between Perpendiculars']),
            depth: cleanFloat(row.Depth),
            breadthExtreme: cleanFloat(row['Breadth Extreme']),
            capacityLiquidOil: cleanInt(row['Capacity - Liquid Oil']),
            commercialMarket: cleanText(row['Commercial Market']),
            commercialSizeClass: cleanText(row['Commercial Size Class']),
            firstAisPositionDate: cleanText(row['First Ais Position Date']),
            currentPortUnlocode: cleanText(row['Current Port Unlocode']),
            currentPortCountry: cleanText(row['Current Port Country']),
            commercialManagerName: cleanText(row['Commercial Manager']),
            commercialManagerEmail: cleanText(row['Commercial Manager Email']),
            commercialManagerCity: cleanText(row['Commercial Manager City']),
            commercialManagerCountry: cleanText(row['Commercial Manager Country']),
            registeredOwnerName: cleanText(row['Registered Owner']),
            registeredOwnerEmail: cleanText(row['Registered Owner Email']),
            registeredOwnerCity: cleanText(row['Registered Owner City']),
            registeredOwnerCountry: cleanText(row['Registered Owner Country']),
            beneficialOwnerName: cleanText(row['Beneficial Owner']),
            beneficialOwnerEmail: cleanText(row['Beneficial Owner Email']),
            beneficialOwnerCity: cleanText(row['Beneficial Owner City']),
            beneficialOwnerCountry: cleanText(row['Beneficial Owner Country']),
            technicalManagerName: cleanText(row['Technical Manager']),
            technicalManagerEmail: cleanText(row['Technical Manager Email']),
            technicalManagerCity: cleanText(row['Technical Manager City']),
            technicalManagerCountry: cleanText(row['Technical Manager Country']),
            pAndIClubName: cleanText(row['P&i Club']),
            pAndIClubEmail: cleanText(row['P&i Club Email']),
            pAndIClubCity: cleanText(row['P&i Club City']),
            pAndIClubCountry: cleanText(row['P&i Club Country']),
            shipBuilderName: cleanText(row['Ship Builder']),
            shipBuilderEmail: cleanText(row['Ship Builder Email']),
            shipBuilderCity: cleanText(row['Ship Builder City']),
            shipBuilderCountry: cleanText(row['Ship Builder Country']),
            classSocietyName: cleanText(row['Class Society']),
            classSocietyEmail: cleanText(row['Class Society Email']),
            classSocietyCity: cleanText(row['Class Society City']),
            classSocietyCountry: cleanText(row['Class Society Country']),
            engineBuilderName: cleanText(row['Engine Builder']),
            engineBuilderEmail: cleanText(row['Engine Builder Email']),
            engineBuilderCity: cleanText(row['Engine Builder City']),
            engineBuilderCountry: cleanText(row['Engine Builder Country']),
            ismManagerName: cleanText(row['Ism Manager']),
            ismManagerEmail: cleanText(row['Ism Manager Email']),
            ismManagerCity: cleanText(row['Ism Manager City']),
            ismManagerCountry: cleanText(row['Ism Manager Country']),
            operatorName: cleanText(row['Operator']),
            operatorEmail: cleanText(row['Operator Email']),
            operatorCity: cleanText(row['Operator City']),
            operatorCountry: cleanText(row['Operator Country']),
            classificationSociety: cleanText(row['Class Society']),
            draft: cleanFloat(row.Draught),
            workspaceId: null,
            source: DataSource.CSV_IMPORT,
            verified: false,
          };
        })
        .filter((record): record is NonNullable<typeof record> => record !== null);

      if (data.length === 0) {
        continue;
      }

      const result = await prisma.vessel.createMany({
        data,
        skipDuplicates: true,
      });

      inserted += result.count;
      console.log(`Uploaded ${Math.min(index + batchSize, rows.length)} vessel rows...`);
    }

    console.log('\n✅ Vessel import complete!');
    console.log(`   Successfully inserted: ${inserted}`);
  } catch (error) {
    console.error('Fatal error during vessel import:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
