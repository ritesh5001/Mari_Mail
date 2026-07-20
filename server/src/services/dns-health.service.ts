import { resolveTxt } from "node:dns/promises";
import { getToken, setToken } from "./token-store.js";

export type DnsHealthResult = {
  domain: string;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  healthScore: number;
  checks: Array<{
    type: "SPF" | "DKIM" | "DMARC";
    ok: boolean;
    record: string | null;
    remediation: string | null;
  }>;
};

const dkimSelectors = ["default", "google", "selector1", "selector2", "k1"];
const cacheTtlSeconds = 60 * 60;

function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

async function txtRecords(name: string) {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

async function findDkimRecord(domain: string) {
  for (const selector of dkimSelectors) {
    const records = await txtRecords(`${selector}._domainkey.${domain}`);
    const record = records.find((item) => item.toLowerCase().includes("v=dkim1"));
    if (record) {
      return record;
    }
  }
  return null;
}

export async function checkDnsHealth(email: string): Promise<DnsHealthResult> {
  const domain = emailDomain(email);
  if (!domain) {
    return {
      domain: "",
      spfOk: false,
      dkimOk: false,
      dmarcOk: false,
      healthScore: 0,
      checks: [
        {
          type: "SPF",
          ok: false,
          record: null,
          remediation: "Use a valid sender email address before checking DNS.",
        },
        {
          type: "DKIM",
          ok: false,
          record: null,
          remediation: "Use a valid sender email address before checking DKIM.",
        },
        {
          type: "DMARC",
          ok: false,
          record: null,
          remediation: "Use a valid sender email address before checking DMARC.",
        },
      ],
    };
  }

  const cacheKey = `dns-health:${domain}`;
  const cached = await getToken(cacheKey);
  if (cached) {
    return JSON.parse(cached) as DnsHealthResult;
  }

  const [domainTxt, dmarcTxt, dkimRecord] = await Promise.all([
    txtRecords(domain),
    txtRecords(`_dmarc.${domain}`),
    findDkimRecord(domain),
  ]);

  const spfRecord = domainTxt.find((item) => item.toLowerCase().startsWith("v=spf1")) ?? null;
  const dmarcRecord = dmarcTxt.find((item) => item.toLowerCase().startsWith("v=dmarc1")) ?? null;
  const spfOk = Boolean(spfRecord);
  const dkimOk = Boolean(dkimRecord);
  const dmarcOk = Boolean(dmarcRecord);
  const healthScore = (spfOk ? 35 : 0) + (dkimOk ? 35 : 0) + (dmarcOk ? 30 : 0);

  const result: DnsHealthResult = {
    domain,
    spfOk,
    dkimOk,
    dmarcOk,
    healthScore,
    checks: [
      {
        type: "SPF",
        ok: spfOk,
        record: spfRecord,
        remediation: spfOk ? null : `Add an SPF TXT record for ${domain} that authorizes your sender provider.`,
      },
      {
        type: "DKIM",
        ok: dkimOk,
        record: dkimRecord,
        remediation: dkimOk ? null : "Publish the DKIM TXT record supplied by Gmail, Outlook, or your SMTP provider.",
      },
      {
        type: "DMARC",
        ok: dmarcOk,
        record: dmarcRecord,
        remediation: dmarcOk ? null : `Add a DMARC TXT record at _dmarc.${domain}, starting with v=DMARC1.`,
      },
    ],
  };

  await setToken(cacheKey, JSON.stringify(result), cacheTtlSeconds);
  return result;
}
