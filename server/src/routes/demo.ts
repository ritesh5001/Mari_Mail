import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma, DemoBookingStatus } from "@marimail/db";
import { sendTransactionalEmail } from "@marimail/email";
import { requireSuperAdmin } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";

export const demoRouter = Router();

const SETTINGS_ID = "singleton";

async function getOrCreateSettings() {
  const existing = await prisma.demoSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.demoSettings.create({ data: { id: SETTINGS_ID } });
}

function resolveAdminRecipient(settingsEmail: string | null | undefined) {
  return (
    settingsEmail?.trim() ||
    process.env.DEMO_ADMIN_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    null
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdminEmail(booking: {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  role?: string | null;
  fleetSize?: string | null;
  message?: string | null;
  preferredAt?: Date | null;
  timezone?: string | null;
  source?: string | null;
  createdAt: Date;
}) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Name", booking.name],
    ["Email", booking.email],
    ["Company", booking.company],
    ["Role", booking.role],
    ["Phone", booking.phone],
    ["Fleet size", booking.fleetSize],
    ["Preferred time", booking.preferredAt ? booking.preferredAt.toISOString() : null],
    ["Timezone", booking.timezone],
    ["Source", booking.source],
    ["Submitted", booking.createdAt.toISOString()],
  ];

  const tableRows = rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");

  const messageBlock = booking.message
    ? `<div style="margin-top:20px;padding:14px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Message</div><div style="white-space:pre-wrap;color:#0f172a;font-size:14px;line-height:1.5;">${escapeHtml(booking.message)}</div></div>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:28px;"><div style="font-size:12px;font-weight:600;color:#0077B6;text-transform:uppercase;letter-spacing:0.08em;">New demo request</div><h1 style="margin:6px 0 18px;font-size:20px;color:#0f172a;">${escapeHtml(booking.name)} wants a demo</h1><table style="width:100%;border-collapse:collapse;">${tableRows}</table>${messageBlock}<p style="margin-top:24px;font-size:12px;color:#94a3b8;">Booking ID: ${escapeHtml(booking.id)}</p></div></body></html>`;

  const text =
    rows
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n") + (booking.message ? `\n\nMessage:\n${booking.message}` : "");

  return { html, text };
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase().max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  fleetSize: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  preferredAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? new Date(value) : undefined)),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
  source: z.string().trim().max(200).optional().or(z.literal("")),
});

const updateSchema = z.object({
  status: z.nativeEnum(DemoBookingStatus).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  registrationEnabled: z.boolean().optional(),
  adminEmail: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  successMessage: z.string().trim().min(2).max(500).optional(),
});

// Public: page can check whether bookings are accepting submissions
demoRouter.get("/public-settings", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    return sendData(res, {
      enabled: settings.enabled,
      successMessage: settings.successMessage,
    });
  } catch (error) {
    return next(error);
  }
});

// Public: create a demo booking
demoRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const settings = await getOrCreateSettings();
    if (!settings.enabled) {
      return sendError(res, 403, "BOOKINGS_DISABLED", "Demo bookings are currently disabled");
    }

    const data = parsed.data;
    const clean = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : null);

    const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const ipAddress = forwarded || req.socket.remoteAddress || null;
    const userAgent = req.header("user-agent") ?? null;

    const booking = await prisma.demoBooking.create({
      data: {
        name: data.name.trim(),
        email: data.email,
        company: clean(data.company),
        phone: clean(data.phone),
        role: clean(data.role),
        fleetSize: clean(data.fleetSize),
        message: clean(data.message),
        preferredAt: data.preferredAt ?? null,
        timezone: clean(data.timezone),
        source: clean(data.source),
        ipAddress,
        userAgent,
      },
    });

    const recipient = resolveAdminRecipient(settings.adminEmail);
    if (recipient) {
      const { html, text } = buildAdminEmail(booking);
      try {
        await sendTransactionalEmail({
          to: recipient,
          subject: `New demo request — ${booking.name}${booking.company ? ` (${booking.company})` : ""}`,
          html,
          text,
        });
      } catch (error) {
        console.warn(
          "[demo] failed to send admin notification:",
          error instanceof Error ? error.message : error,
        );
      }
    } else {
      console.info(`[demo] no admin recipient configured; booking ${booking.id} stored without notification`);
    }

    return sendData(
      res,
      {
        id: booking.id,
        successMessage: settings.successMessage,
      },
      201,
    );
  } catch (error) {
    return next(error);
  }
});

// Admin: list bookings
demoRouter.get("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Prisma.DemoBookingWhereInput = {};
    if (status && Object.values(DemoBookingStatus).includes(status as DemoBookingStatus)) {
      where.status = status as DemoBookingStatus;
    }

    const [bookings, counts] = await Promise.all([
      prisma.demoBooking.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.demoBooking.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const summary = counts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return sendData(res, { bookings, summary });
  } catch (error) {
    return next(error);
  }
});

// Admin: read settings (must precede /:id routes)
demoRouter.get("/settings", requireSuperAdmin, async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    return sendData(res, settings);
  } catch (error) {
    return next(error);
  }
});

// Admin: update settings (toggle on/off, change admin email)
demoRouter.patch("/settings", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await getOrCreateSettings();
    const updated = await prisma.demoSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        enabled: parsed.data.enabled,
        registrationEnabled: parsed.data.registrationEnabled,
        adminEmail: parsed.data.adminEmail === undefined ? undefined : parsed.data.adminEmail,
        successMessage: parsed.data.successMessage,
      },
    });

    return sendData(res, updated);
  } catch (error) {
    return next(error);
  }
});

// Admin: update one booking
demoRouter.patch("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const booking = await prisma.demoBooking.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
      },
    });

    return sendData(res, booking);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return sendError(res, 404, "NOT_FOUND", "Booking not found");
    }
    return next(error);
  }
});

// Admin: delete one
demoRouter.delete("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    await prisma.demoBooking.delete({ where: { id: req.params.id } });
    return sendData(res, { id: req.params.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return sendError(res, 404, "NOT_FOUND", "Booking not found");
    }
    return next(error);
  }
});
