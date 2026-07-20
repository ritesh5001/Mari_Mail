import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata = {
  title: "Privacy · MariMail",
  description: "How MariMail collects, uses, and safeguards your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      updatedAt="July 2026"
      intro="MariMail is built for marine businesses that treat contact data seriously. This policy explains what we collect, why, and how we handle it — in plain language."
    >
      <h2>1. What we collect</h2>
      <p>When you use MariMail, we collect the information you give us directly:</p>
      <ul>
        <li>Account details — name, work email, company, role.</li>
        <li>Workspace data — vessels, contacts, lists, campaigns you upload or create.</li>
        <li>Sending accounts — the email inboxes you connect for sending campaigns.</li>
        <li>Billing information — processed through our payments provider; card numbers never touch our servers.</li>
      </ul>
      <p>We also collect operational data automatically: IP, browser, timestamps of your actions, and delivery/engagement events for the emails you send through us (opens, clicks, bounces, replies).</p>

      <h2>2. How we use it</h2>
      <ul>
        <li>To run your workspace — matching vessels to contacts, scheduling ETA-triggered sends, showing analytics.</li>
        <li>To keep your account secure — detecting abuse, preventing account takeover.</li>
        <li>To improve the product — anonymised, aggregated usage patterns.</li>
        <li>To bill you — through Stripe.</li>
        <li>To reach you about the service — critical account or security notices only. Marketing emails are opt-in.</li>
      </ul>

      <h2>3. Third-party data sources</h2>
      <p>MariMail enriches vessel and contact data through partners such as Apollo.io and our internal Maribiz index. When you unlock a contact from those sources, we retain the unlocked fields so we don&rsquo;t re-pay the source for the same person — this benefits every workspace on the platform.</p>

      <h2>4. Where your data lives</h2>
      <p>Data is stored in encrypted PostgreSQL databases hosted in the US and EU regions. Backups are retained for 30 days. Redis is used for ephemeral queueing (delivery jobs, rate limits) and does not hold long-term personal data.</p>

      <h2>5. Sharing</h2>
      <p>We do not sell your data. We share it only with subprocessors that make MariMail work — email deliverability providers, payments, analytics, error tracking. A full subprocessor list is available on request at{" "}
        <a href="mailto:privacy@marimail.app">privacy@marimail.app</a>.</p>

      <h2>6. Your rights</h2>
      <p>Under GDPR, UK GDPR, and comparable laws, you can access, correct, export, or delete your personal data. Email{" "}
        <a href="mailto:privacy@marimail.app">privacy@marimail.app</a> and we&rsquo;ll respond within 30 days.</p>

      <h2>7. Retention</h2>
      <p>Workspace data is kept for the life of your subscription plus 30 days for restore purposes. After that it is permanently deleted. Aggregated, non-identifying metrics may be retained longer.</p>

      <h2>8. Contact</h2>
      <p>Questions about this policy? Reach us at <a href="mailto:privacy@marimail.app">privacy@marimail.app</a>.</p>
    </LegalPageShell>
  );
}
