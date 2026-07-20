import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata = {
  title: "DPA · MariMail",
  description: "Data Processing Addendum for MariMail customers.",
};

export default function DpaPage() {
  return (
    <LegalPageShell
      title="Data Processing Addendum"
      updatedAt="July 2026"
      intro="This DPA supplements the MariMail Terms of Service when you use the service to process personal data on behalf of your customers or prospects."
    >
      <h2>1. Roles</h2>
      <p>You are the Data Controller of the personal data you upload to MariMail. MariMail is the Data Processor, acting on your documented instructions as expressed through your use of the product.</p>

      <h2>2. Scope of processing</h2>
      <ul>
        <li><strong>Subject matter:</strong> operating the MariMail platform on your behalf.</li>
        <li><strong>Duration:</strong> for the lifetime of your subscription, plus 30 days for restore.</li>
        <li><strong>Nature and purpose:</strong> storing, matching, enriching, and sending outreach to your business contacts.</li>
        <li><strong>Data categories:</strong> business contact details (name, work email, company, role), vessel operational data, campaign and email engagement events.</li>
        <li><strong>Data subjects:</strong> your prospects, customers, and the crew/managers listed against vessels you track.</li>
      </ul>

      <h2>3. Security</h2>
      <p>MariMail implements the technical and organisational measures described on our <a href="/security">Security page</a>. These form Annex II of this DPA.</p>

      <h2>4. Subprocessors</h2>
      <p>You authorise MariMail to engage subprocessors to deliver the service — including Vercel (hosting), Neon (database), Upstash (queues), Stripe (billing), Resend/Postmark/SendGrid/SES (email delivery, when connected), and Apollo.io (contact enrichment, when enabled). A current list is available on request at <a href="mailto:privacy@marimail.app">privacy@marimail.app</a>. We give 30 days&rsquo; notice before adding new subprocessors.</p>

      <h2>5. International transfers</h2>
      <p>Where MariMail transfers personal data outside the EEA/UK, we rely on the EU Standard Contractual Clauses (2021 module 2 + UK Addendum) as incorporated by reference here.</p>

      <h2>6. Assistance</h2>
      <p>We assist you in responding to data subject requests, DPIAs, and regulator inquiries, taking into account the nature of the processing and the information available to us.</p>

      <h2>7. Breach notification</h2>
      <p>We notify you without undue delay — and in any event within 72 hours — of any personal data breach that affects your data.</p>

      <h2>8. Deletion and return</h2>
      <p>On termination of your subscription, we delete your personal data within 30 days unless retention is required by law. Export via our API or admin panel is available before deletion.</p>

      <h2>9. Audits</h2>
      <p>Once per year, on 30 days&rsquo; notice, you may request our latest SOC 2 report and subprocessor list. On-site audits are available under NDA for enterprise plans.</p>

      <h2>10. Signature</h2>
      <p>Acceptance of the MariMail Terms of Service constitutes acceptance of this DPA. For a countersigned copy, email <a href="mailto:legal@marimail.app">legal@marimail.app</a>.</p>
    </LegalPageShell>
  );
}
