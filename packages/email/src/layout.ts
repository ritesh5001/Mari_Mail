/**
 * Branded layout for transactional email.
 *
 * Transactional mail was being sent as a bare unstyled sentence, which reads as
 * a phishing attempt rather than a product email — exactly the wrong first
 * impression on a verification link people are asked to click.
 *
 * Deliberately old-school HTML: tables, inline styles, no flex/grid, no
 * external CSS or webfonts. Gmail strips <style> blocks, Outlook renders with
 * Word's engine, and most clients block remote assets by default — inline
 * table markup is the only thing that survives all of them.
 */

const BRAND = "#4F6DFF";
const INK = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const SURFACE = "#F8FAFC";

export type EmailLayoutOptions = {
  /** Big heading at the top of the card. */
  heading: string;
  /** One or more paragraphs of body copy (plain strings, HTML-escaped by you). */
  body: string[];
  /** Optional primary call-to-action. */
  cta?: { label: string; url: string };
  /** Small print under the CTA — e.g. link expiry, "ignore if this wasn't you". */
  footnote?: string;
  /** Preview text shown in the inbox list next to the subject. */
  preheader?: string;
};

/** Minimal HTML escaping for interpolated values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmailLayout(options: EmailLayoutOptions): string {
  const { heading, body, cta, footnote, preheader } = options;

  const paragraphs = body
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${INK};">${text}</p>`,
    )
    .join("");

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr><td style="border-radius:8px;background:${BRAND};">
           <a href="${cta.url}"
              style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;
                     color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>
       <!-- Many clients strip or mangle buttons; always give the raw URL too. -->
       <p style="margin:0 0 8px;font-size:12px;line-height:20px;color:${MUTED};">
         If the button doesn't work, copy and paste this link:<br>
         <a href="${cta.url}" style="color:${BRAND};word-break:break-all;">${escapeHtml(cta.url)}</a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:28px 32px 0;">
            <span style="font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${BRAND};">MariMail</span>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 32px;">
            <h1 style="margin:0 0 14px;font-size:21px;line-height:28px;font-weight:700;color:${INK};">
              ${escapeHtml(heading)}
            </h1>
            ${paragraphs}
            ${button}
            ${
              footnote
                ? `<p style="margin:16px 0 0;font-size:12px;line-height:20px;color:${MUTED};">${footnote}</p>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid ${BORDER};">
            <p style="margin:0;font-size:12px;line-height:18px;color:${MUTED};">
              MariMail — marine intelligence &amp; ETA-triggered outreach.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
