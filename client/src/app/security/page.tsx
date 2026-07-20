import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata = {
  title: "Security · MariMail",
  description: "How MariMail protects your data and infrastructure.",
};

export default function SecurityPage() {
  return (
    <LegalPageShell
      title="Security"
      updatedAt="July 2026"
      intro="MariMail handles operational contact data for marine businesses. Security is not a checkbox — here is how we approach it."
    >
      <h2>Infrastructure</h2>
      <ul>
        <li>Hosted on Vercel (application) and Neon (managed PostgreSQL) — both SOC 2 Type II attested.</li>
        <li>All traffic is served over TLS 1.2+; HSTS is enforced.</li>
        <li>Database connections require TLS and channel binding.</li>
        <li>Backups run continuously with point-in-time restore to any moment in the last 7 days; nightly snapshots retained for 30 days.</li>
      </ul>

      <h2>Data at rest</h2>
      <ul>
        <li>Database volumes are AES-256 encrypted by the storage provider.</li>
        <li>Third-party API keys (email providers, Apollo, Maribiz) are encrypted at the application layer before being written to the database — even a full DB dump does not expose them in plaintext.</li>
        <li>Passwords are hashed with bcrypt.</li>
      </ul>

      <h2>Access control</h2>
      <ul>
        <li>Workspace data is scoped by <code>workspaceId</code> on every query — cross-workspace reads are structurally impossible.</li>
        <li>Super-admin access is limited to named engineers and audit-logged.</li>
        <li>Production database credentials are stored in a secret manager; no engineer has standing prod access.</li>
      </ul>

      <h2>Application</h2>
      <ul>
        <li>All input is validated with Zod schemas at the API boundary.</li>
        <li>Prisma parameterises every query — no raw SQL from user input.</li>
        <li>Session cookies are httpOnly, secure, SameSite=lax.</li>
        <li>Rate limiting protects login, credit-spending endpoints, and public forms.</li>
      </ul>

      <h2>Email deliverability</h2>
      <p>MariMail sends through your connected mailboxes or ESPs — we never hold or reuse recipient lists across workspaces for our own sending. Bounces and unsubscribes are honoured platform-wide.</p>

      <h2>Incident response</h2>
      <p>If we detect a security incident affecting your data, we will notify the workspace owner within 72 hours with a description of the scope, what we know, and remediation steps.</p>

      <h2>Reporting a vulnerability</h2>
      <p>If you find a security issue, please email <a href="mailto:security@marimail.app">security@marimail.app</a>. We do not currently run a public bug bounty but we respond to every report and acknowledge researchers who report responsibly.</p>
    </LegalPageShell>
  );
}
