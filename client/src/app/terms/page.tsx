import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata = {
  title: "Terms · MariMail",
  description: "The terms of service governing use of MariMail.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      updatedAt="July 2026"
      intro="These terms govern your use of MariMail. By creating an account, you agree to them."
    >
      <h2>1. Your account</h2>
      <p>You must be at least 18 years old and authorised to bind your organisation. You&rsquo;re responsible for keeping your credentials safe and for everything that happens inside your workspace.</p>

      <h2>2. Acceptable use</h2>
      <p>MariMail is a business-to-business outreach platform. You agree not to use it to:</p>
      <ul>
        <li>Send unsolicited bulk email that violates CAN-SPAM, CASL, GDPR ePrivacy rules or equivalents.</li>
        <li>Impersonate a person or organisation, or falsify email headers.</li>
        <li>Send content that is illegal, defamatory, discriminatory, or harmful.</li>
        <li>Attempt to breach or interfere with MariMail&rsquo;s security or availability.</li>
      </ul>
      <p>We may suspend or terminate any workspace found to be violating these rules.</p>

      <h2>3. Your content</h2>
      <p>You keep ownership of the vessels, contacts, templates, and campaigns you bring to MariMail. You grant us a limited licence to process that content solely to operate the service on your behalf.</p>

      <h2>4. Credits and billing</h2>
      <p>Plans are billed monthly or annually. Credits used to reveal contacts from paid sources (Apollo, etc.) do not roll over past your billing period unless your plan specifies otherwise. Refunds are granted at our discretion within 14 days of a charge.</p>

      <h2>5. Deliverability</h2>
      <p>MariMail sends through your connected mailboxes and ESP accounts. You are responsible for the reputation of those accounts, your domain&rsquo;s SPF/DKIM/DMARC configuration, and complying with the sending policies of your providers.</p>

      <h2>6. Availability</h2>
      <p>We target 99.9% monthly uptime for the platform. Scheduled maintenance is announced in advance where possible. We are not liable for downtime caused by force majeure, upstream provider outages, or actions taken to protect the platform.</p>

      <h2>7. Termination</h2>
      <p>You can cancel any time from your billing page — the service remains active through the end of the paid period. On cancellation, your workspace data is retained for 30 days for restore, then deleted.</p>

      <h2>8. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, MariMail&rsquo;s aggregate liability under these terms will not exceed the fees you paid us in the 12 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.</p>

      <h2>9. Changes</h2>
      <p>We may update these terms as the service evolves. Material changes will be announced at least 30 days before they take effect via email and this page.</p>

      <h2>10. Contact</h2>
      <p>Questions? Email <a href="mailto:legal@marimail.app">legal@marimail.app</a>.</p>
    </LegalPageShell>
  );
}
