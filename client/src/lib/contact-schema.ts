import type { ContactModel } from "@/lib/contact-data";

type ContactFieldKey = keyof ContactModel;

export type ContactSchemaField = {
  label: string;
  key: ContactFieldKey;
  group: "Identity" | "Company" | "Communication" | "Digital" | "CRM";
};

export const CONTACT_SCHEMA_FIELDS: ContactSchemaField[] = [
  { label: "First Name", key: "firstName", group: "Identity" },
  { label: "Last Name", key: "lastName", group: "Identity" },
  { label: "Title", key: "title", group: "Identity" },
  { label: "Company", key: "companyName", group: "Company" },
  { label: "Email", key: "email", group: "Communication" },
  { label: "Departments", key: "department", group: "Company" },
  { label: "Contact Owner", key: "contactOwnerName", group: "CRM" },
  { label: "Home Phone", key: "homePhone", group: "Communication" },
  { label: "Mobile Phone", key: "mobilePhone", group: "Communication" },
  { label: "Corporate Phone", key: "corporatePhone", group: "Communication" },
  { label: "Other Phone", key: "otherPhone", group: "Communication" },
  { label: "Person Linkedin Url", key: "personLinkedinUrl", group: "Digital" },
  { label: "Website", key: "website", group: "Digital" },
  { label: "Company Linkedin Url", key: "companyLinkedinUrl", group: "Digital" },
  { label: "Country", key: "country", group: "Company" },
  { label: "Subsidiary of", key: "subsidiaryOf", group: "Company" },
  { label: "Secondary Email", key: "secondaryEmail", group: "Communication" },
  { label: "Salesforce ID", key: "salesforceId", group: "CRM" },
];

export const CONTACT_SCHEMA_HEADERS = CONTACT_SCHEMA_FIELDS.map((field) => field.label);

export function contactFieldValue(contact: Partial<Record<ContactFieldKey, unknown>>, field: ContactSchemaField) {
  const raw = contact[field.key];
  if (raw === null || raw === undefined || raw === "") return "-";
  if (Array.isArray(raw)) return raw.length > 0 ? raw.join(", ") : "-";
  if (raw instanceof Date) return raw.toISOString();
  return String(raw);
}
