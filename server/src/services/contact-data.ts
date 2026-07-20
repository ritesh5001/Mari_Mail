import type { Prisma } from "@marimail/db";

type Row = Record<string, string | undefined>;

export const CONTACT_CSV_HEADERS = [
  "First Name",
  "Last Name",
  "Title",
  "Company",
  "Email",
  "Departments",
  "Contact Owner",
  "Home Phone",
  "Mobile Phone",
  "Corporate Phone",
  "Other Phone",
  "Person Linkedin Url",
  "Website",
  "Company Linkedin Url",
  "Country",
  "Subsidiary of",
  "Secondary Email",
  "Salesforce ID",
] as const;

type ContactCsvHeader = (typeof CONTACT_CSV_HEADERS)[number];

const contactAliases: Partial<Record<ContactCsvHeader, string[]>> = {
  "First Name": ["firstName"],
  "Last Name": ["lastName"],
  Company: ["Company Name", "companyName"],
  Email: ["Primary Email", "email"],
  Departments: ["Department", "department"],
  "Contact Owner": ["contactOwner", "contactOwnerName"],
  "Home Phone": ["homePhone"],
  "Mobile Phone": ["mobilePhone"],
  "Corporate Phone": ["corporatePhone"],
  "Other Phone": ["otherPhone"],
  "Person Linkedin Url": ["Person LinkedIn URL", "personLinkedinUrl"],
  "Company Linkedin Url": ["Company LinkedIn URL", "companyLinkedinUrl"],
  "Subsidiary of": ["Subsidiary Of", "subsidiaryOf"],
  "Secondary Email": ["secondaryEmail"],
  "Salesforce ID": ["salesforceId"],
};

function read(row: Row, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function readContactValue(row: Row, header: ContactCsvHeader) {
  return read(row, [header, ...(contactAliases[header] ?? [])]);
}

function textValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function departmentsValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((part) => part.trim()).filter(Boolean);
  }

  return value
    ? value
        .split(/[;,|]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

export function contactDataFromRow(row: Row) {
  return {
    firstName: textValue(readContactValue(row, "First Name")),
    lastName: textValue(readContactValue(row, "Last Name")),
    title: textValue(readContactValue(row, "Title")),
    companyName: textValue(readContactValue(row, "Company")),
    email: textValue(readContactValue(row, "Email"))?.toLowerCase(),
    department: departmentsValue(readContactValue(row, "Departments")),
    contactOwnerName: textValue(readContactValue(row, "Contact Owner")),
    homePhone: textValue(readContactValue(row, "Home Phone")),
    mobilePhone: textValue(readContactValue(row, "Mobile Phone")),
    corporatePhone: textValue(readContactValue(row, "Corporate Phone")),
    otherPhone: textValue(readContactValue(row, "Other Phone")),
    personLinkedinUrl: textValue(readContactValue(row, "Person Linkedin Url")),
    website: textValue(readContactValue(row, "Website")),
    companyLinkedinUrl: textValue(readContactValue(row, "Company Linkedin Url")),
    country: textValue(readContactValue(row, "Country")),
    subsidiaryOf: textValue(readContactValue(row, "Subsidiary of")),
    secondaryEmail: textValue(readContactValue(row, "Secondary Email"))?.toLowerCase(),
    salesforceId: textValue(readContactValue(row, "Salesforce ID")),
  } satisfies Partial<Prisma.ContactUncheckedCreateInput>;
}
