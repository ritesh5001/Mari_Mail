/**
 * HTTP-API senders for providers whose SMTP egress is commonly blocked on
 * serverless / free-tier hosts. Each returns a tiny object that quacks like
 * nodemailer's Transporter (just `sendMail`) so the rest of the codebase can
 * stay provider-agnostic.
 */

export type SendMessage = {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type LikeTransport = {
  sendMail(message: SendMessage): Promise<{ messageId: string }>;
};

function customHeaderEntries(headers: Record<string, string> | undefined) {
  return headers
    ? Object.entries(headers).map(([name, value]) => ({ name, value }))
    : [];
}

const HTTP_TIMEOUT_MS = 20_000;

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const wrapped = new Error("Provider HTTP API timed out");
      (wrapped as Error & { code: string }).code = "ETIMEDOUT_WRAPPED";
      throw wrapped;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      errors?: Array<{ message?: string }>;
    };
    return (
      json.message ??
      json.error ??
      json.errors?.[0]?.message ??
      `${response.status} ${response.statusText}`
    );
  } catch {
    return text.slice(0, 300);
  }
}

function throwAuthOrEnvelope(status: number, message: string): never {
  const err = new Error(message);
  if (status === 401 || status === 403)
    (err as Error & { code: string }).code = "EAUTH";
  else if (status === 422 || status === 400)
    (err as Error & { code: string }).code = "EENVELOPE";
  (err as Error & { responseCode: number }).responseCode = status;
  throw err;
}

// --- Resend -----------------------------------------------------------------

export function buildResendHttpTransport(apiKey: string): LikeTransport {
  return {
    async sendMail(message) {
      const response = await postJson(
        "https://api.resend.com/emails",
        {
          from: message.from,
          to: toArray(message.to),
          subject: message.subject,
          text: message.text,
          html: message.html,
          reply_to: message.replyTo,
          headers: message.headers,
        },
        { Authorization: `Bearer ${apiKey}` },
      );
      if (!response.ok)
        throwAuthOrEnvelope(response.status, await readErrorMessage(response));
      const json = (await response.json()) as { id?: string };
      return { messageId: json.id ?? "resend" };
    },
  };
}

// --- SendGrid ---------------------------------------------------------------

export function buildSendgridHttpTransport(apiKey: string): LikeTransport {
  return {
    async sendMail(message) {
      const fromMatch = /^(?:(.*?)\s*<)?([^<>]+@[^<>]+?)>?$/.exec(
        message.from.trim(),
      );
      const fromName = fromMatch?.[1]?.trim();
      const fromEmail = fromMatch?.[2]?.trim() ?? message.from;

      const replyToMatch = message.replyTo
        ? /^(?:(.*?)\s*<)?([^<>]+@[^<>]+?)>?$/.exec(message.replyTo.trim())
        : null;

      const body: Record<string, unknown> = {
        personalizations: [
          { to: toArray(message.to).map((email) => ({ email })) },
        ],
        from: fromName
          ? { email: fromEmail, name: fromName }
          : { email: fromEmail },
        subject: message.subject,
        content: [
          ...(message.text
            ? [{ type: "text/plain", value: message.text }]
            : []),
          ...(message.html ? [{ type: "text/html", value: message.html }] : []),
        ],
      };
      if (replyToMatch?.[2]) {
        body.reply_to = replyToMatch[1]
          ? { email: replyToMatch[2], name: replyToMatch[1] }
          : { email: replyToMatch[2] };
      }
      if (message.headers && Object.keys(message.headers).length > 0) {
        body.headers = message.headers;
      }

      const response = await postJson(
        "https://api.sendgrid.com/v3/mail/send",
        body,
        { Authorization: `Bearer ${apiKey}` },
      );
      if (!response.ok)
        throwAuthOrEnvelope(response.status, await readErrorMessage(response));
      const messageId = response.headers.get("X-Message-Id") ?? "sendgrid";
      return { messageId };
    },
  };
}

// --- Postmark ---------------------------------------------------------------

export function buildPostmarkHttpTransport(serverToken: string): LikeTransport {
  return {
    async sendMail(message) {
      const recipients = toArray(message.to).join(",");
      const response = await postJson(
        "https://api.postmarkapp.com/email",
        {
          From: message.from,
          To: recipients,
          Subject: message.subject,
          TextBody: message.text,
          HtmlBody: message.html,
          ReplyTo: message.replyTo,
          Headers: customHeaderEntries(message.headers),
          MessageStream: "outbound",
        },
        { "X-Postmark-Server-Token": serverToken, Accept: "application/json" },
      );
      if (!response.ok)
        throwAuthOrEnvelope(response.status, await readErrorMessage(response));
      const json = (await response.json()) as { MessageID?: string };
      return { messageId: json.MessageID ?? "postmark" };
    },
  };
}

// --- Mailgun ----------------------------------------------------------------

export function buildMailgunHttpTransport(
  apiKey: string,
  domain: string,
  baseUrl = "https://api.mailgun.net",
): LikeTransport {
  return {
    async sendMail(message) {
      const form = new FormData();
      form.set("from", message.from);
      for (const recipient of toArray(message.to)) form.append("to", recipient);
      form.set("subject", message.subject);
      if (message.text) form.set("text", message.text);
      if (message.html) form.set("html", message.html);
      if (message.replyTo) form.set("h:Reply-To", message.replyTo);
      if (message.headers) {
        for (const [name, value] of Object.entries(message.headers)) {
          form.set(`h:${name}`, value);
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, "")}/v3/${domain}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
            },
            body: form,
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throwAuthOrEnvelope(
            response.status,
            await readErrorMessage(response),
          );
        const json = (await response.json()) as { id?: string };
        return { messageId: json.id ?? "mailgun" };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          const wrapped = new Error("Provider HTTP API timed out");
          (wrapped as Error & { code: string }).code = "ETIMEDOUT_WRAPPED";
          throw wrapped;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
