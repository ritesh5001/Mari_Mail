#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient, Seniority, MarineRole, DataSource } from '@prisma/client';

interface CSVContact {
  'First Name': string;
  'Last Name': string;
  'Title': string;
  'Company': string;
  'Email': string;
  'Departments': string;
  'Contact Owner': string;
  'Home Phone': string;
  'Mobile Phone': string;
  'Corporate Phone': string;
  'Other Phone': string;
  'Person Linkedin Url': string;
  'Website': string;
  'Company Linkedin Url': string;
  'Country': string;
  'Subsidiary of': string;
  'Secondary Email': string;
  'Salesforce ID': string;
}

function parseCSV(content: string): CSVContact[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    // Simple CSV parser (handles basic cases)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    
    return record as CSVContact;
  });
}

function inferSeniority(title: string): Seniority {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('founder') || titleLower.includes('owner')) return 'FOUNDER';
  if (titleLower.includes('c-level') || titleLower.includes('ceo') || titleLower.includes('cfo') || titleLower.includes('cto')) return 'C_LEVEL';
  if (titleLower.includes('vp') || titleLower.includes('vice president')) return 'VP';
  if (titleLower.includes('director')) return 'DIRECTOR';
  if (titleLower.includes('manager') || titleLower.includes('head of')) return 'MANAGER';
  if (titleLower.includes('lead')) return 'LEAD';
  if (titleLower.includes('senior')) return 'SENIOR';
  if (titleLower.includes('assistant')) return 'ENTRY';
  if (titleLower.includes('intern')) return 'INTERN';
  
  return 'MID';
}

function inferMarineRole(departments: string): MarineRole {
  const deptLower = departments.toLowerCase();
  
  if (deptLower.includes('chartering') || deptLower.includes('commercial')) return 'CHARTERING_MANAGER';
  if (deptLower.includes('technical') || deptLower.includes('engineering')) return 'TECHNICAL_MANAGER';
  if (deptLower.includes('crew') || deptLower.includes('crewing')) return 'CREWING_MANAGER';
  if (deptLower.includes('operations') || deptLower.includes('fleet')) return 'FLEET_MANAGER';
  if (deptLower.includes('superintendent')) return 'SHIP_SUPERINTENDENT';
  if (deptLower.includes('vetting')) return 'CLASS_SURVEYOR';
  if (deptLower.includes('safety') || deptLower.includes('hseq')) return 'PORT_CAPTAIN';
  if (deptLower.includes('broker')) return 'BROKER';
  if (deptLower.includes('agent')) return 'PORT_AGENT';
  if (deptLower.includes('surveyor')) return 'MARINE_SURVEYOR';
  
  return 'OTHER';
}

async function main() {
  const csvPath = path.resolve(__dirname, '../contacts-apollo.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const contacts = parseCSV(content);
  
  if (contacts.length === 0) {
    console.error('No contacts found in CSV');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  
  try {
    console.log(`Found ${contacts.length} contacts to upload`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const batchSize = 200;

    const rows = contacts
      .filter((contact) => contact['First Name'] && contact['Email'] && contact['Company'])
      .map((contact) => {
        const departments = contact['Departments']
          ? contact['Departments'].split(',').map((department) => department.trim()).filter(Boolean)
          : [];

        const phone = (value: string) => {
          if (!value) return undefined;
          const cleaned = value.replace(/^['"]|['"]$/g, '').trim();
          return cleaned || undefined;
        };

        return {
          firstName: contact['First Name'].trim(),
          lastName: contact['Last Name']?.trim() || '',
          title: contact['Title']?.trim() || undefined,
          email: contact['Email'].trim().toLowerCase(),
          secondaryEmail: contact['Secondary Email']?.trim().toLowerCase() || undefined,
          companyName: contact['Company'].trim(),
          department: departments,
          homePhone: phone(contact['Home Phone']),
          mobilePhone: phone(contact['Mobile Phone']),
          corporatePhone: phone(contact['Corporate Phone']),
          otherPhone: phone(contact['Other Phone']),
          personLinkedinUrl: contact['Person Linkedin Url']?.trim() || undefined,
          website: contact['Website']?.trim() || undefined,
          companyLinkedinUrl: contact['Company Linkedin Url']?.trim() || undefined,
          country: contact['Country']?.trim() || undefined,
          subsidiaryOf: contact['Subsidiary of']?.trim() || undefined,
          salesforceId: contact['Salesforce ID']?.trim() || undefined,
          seniority: inferSeniority(contact['Title'] || ''),
          marineRole: inferMarineRole(contact['Departments'] || ''),
          source: DataSource.CSV_IMPORT,
        };
      });

    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = rows.slice(index, index + batchSize);
      try {
        const result = await prisma.contact.createMany({
          data: batch,
          skipDuplicates: true,
        });

        successCount += result.count;
        console.log(`Uploaded ${Math.min(index + batchSize, rows.length)} contacts...`);
      } catch (error) {
        errorCount += batch.length;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Batch ${Math.floor(index / batchSize) + 1}: ${errorMsg}`);

        if (errors.length <= 5) {
          console.warn(`Error uploading batch ${Math.floor(index / batchSize) + 1}: ${errorMsg}`);
        }
      }
    }

    console.log('\n✅ Upload complete!');
    console.log(`   Successfully uploaded: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    
    if (errors.length > 5) {
      console.log(`   (Showing first 5 errors, ${errors.length - 5} more not displayed)`);
    }

  } catch (error) {
    console.error('Fatal error during upload:', (error as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
