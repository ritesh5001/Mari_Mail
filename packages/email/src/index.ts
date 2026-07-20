import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendTransactionalEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "MariMail <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(`Email skipped; RESEND_API_KEY is not set. Subject: ${input.subject}`);
    return { id: "development-email-skipped" };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export type PersonalizationValues = Record<string, string | number | null | undefined>;

const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function extractTemplateVariables(template: string) {
  const variables = new Set<string>();
  for (const match of template.matchAll(variablePattern)) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  return Array.from(variables).sort();
}

export function renderTemplate(template: string, values: PersonalizationValues) {
  return template.replace(variablePattern, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined || value === "") {
      return "there";
    }
    return String(value);
  });
}

export function validateTemplateCoverage(templates: string[], values: PersonalizationValues) {
  const variables = Array.from(new Set(templates.flatMap((template) => extractTemplateVariables(template))));
  if (variables.length === 0) {
    return { variables, resolved: [], missing: [], coverage: 100 };
  }

  const resolved = variables.filter((variable) => {
    const value = values[variable];
    return value !== null && value !== undefined && value !== "";
  });
  const missing = variables.filter((variable) => !resolved.includes(variable));
  return {
    variables,
    resolved,
    missing,
    coverage: Math.round((resolved.length / variables.length) * 100),
  };
}

export function plainTextFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Turn a sequence body into HTML that preserves what the user typed. Our
 * step editor is a plain textarea — the user hits Enter for a line break
 * and blank line for a new paragraph — but sequence-sender pipes the string
 * straight into `html:` on the outgoing mail. HTML collapses those
 * whitespace runs to a single space, so mail arrived as one wall of text.
 *
 * This preserves the shape:
 *   - If the body already looks like HTML (contains a block-level tag or a
 *     line-break tag), pass it through — assume the author knows what
 *     they're doing.
 *   - Otherwise HTML-escape the raw text, split on blank lines into
 *     paragraphs, and convert single line breaks inside a paragraph to
 *     `<br>`. Each paragraph becomes `<p>…</p>` so mail clients render the
 *     spacing correctly.
 */
export function bodyToHtml(text: string) {
  if (!text) return "";
  // Rough "is this already HTML" heuristic — a block-level or line-break
  // tag in the middle of the string is enough of a hint. `<html>`,
  // `<body>`, `<p>`, `<div>`, `<table>`, or `<br>`.
  if (/<(?:html|body|p|div|table|br|section|article)\b/i.test(text)) {
    return text;
  }
  const escape = (raw: string) =>
    raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map((chunk) => `<p style="margin:0 0 1em 0;">${escape(chunk).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function withTracking(html: string, appUrl: string, trackingId: string, options: { opens: boolean; clicks: boolean }) {
  let output = html;

  if (options.clicks) {
    output = output.replace(/href="([^"]+)"/gi, (_match, url: string) => {
      if (url.startsWith("#") || url.startsWith("mailto:") || url.includes("/unsubscribe/")) {
        return `href="${url}"`;
      }
      return `href="${appUrl}/t/c/${trackingId}?url=${encodeURIComponent(url)}"`;
    });
  }

  if (options.opens) {
    const pixel = `<img src="${appUrl}/t/o/${trackingId}?px=1" width="1" height="1" alt="" style="display:none" />`;
    output = output.includes("</body>") ? output.replace("</body>", `${pixel}</body>`) : `${output}${pixel}`;
  }

  return output;
}
