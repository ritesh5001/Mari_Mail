import { config as loadEnv } from "dotenv";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter, billingWebhookRouter } from "./routes/billing.js";
import { campaignRouter } from "./routes/campaigns.js";
import { companyRouter } from "./routes/companies.js";
import { contactRouter } from "./routes/contacts.js";
import { demoRouter } from "./routes/demo.js";
import { filterRouter } from "./routes/filters.js";
import { importRouter } from "./routes/imports.js";
import { inboxRouter } from "./routes/inboxes.js";
import { listRouter } from "./routes/lists.js";
import { savedRouter } from "./routes/saved.js";
import { sendingDomainRouter } from "./routes/sending-domains.js";
import { portRouter } from "./routes/ports.js";
import { providerWebhookRouter } from "./routes/provider-webhooks.js";
import { portRadarRouter } from "./routes/port-radar.js";
import { portRuleRouter, cargoRuleRouter } from "./routes/port-rules.js";
import { searchRouter } from "./routes/search.js";
import { savedFilterRouter } from "./routes/saved-filters.js";
import { vesselRouter } from "./routes/vessels.js";
import { vesselEtaRouter } from "./routes/vessel-etas.js";
import { adminMaribizRouter } from "./routes/admin/maribiz.js";
import { adminApolloRouter } from "./routes/admin/apollo.js";
import { adminDataSourcesRouter } from "./routes/admin/data-sources.js";
import { workspaceRouter } from "./routes/workspaces.js";
import { inboundRouter, trackingRouter, unsubscribeRouter } from "./routes/tracking.js";
import { setRealtimeServer } from "./services/realtime.js";
import { checkRedisHealth } from "./services/token-store.js";
import { startBackendWorkers } from "./worker.js";
import { prisma } from "@marimail/db";

loadEnv({ path: new URL("../../.env", import.meta.url) });

process.on("unhandledRejection", (reason) => {
  console.warn("[unhandledRejection]", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.warn("[uncaughtException]", err.message);
});

const requiredEnv = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY", "DATABASE_URL"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  console.error(`Missing required env vars: ${missingEnv.join(", ")}`);
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
  }
}

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3001);
const webOrigin = process.env.APP_URL ?? "http://localhost:3000";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const workersEnabled = process.env.START_WORKERS !== "false";
const bodyLimit = process.env.HTTP_BODY_LIMIT ?? "100mb";

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. server-to-server, curl)
      if (!origin) return callback(null, true);
      // If an exact origin list is configured, use it; otherwise allow the single webOrigin
      if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
      if (origin === webOrigin) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use("/api/billing", billingWebhookRouter);
app.use(compression());
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: bodyLimit }));
app.use(express.text({ type: "text/csv", limit: bodyLimit }));
app.use(cookieParser());

async function getQueueDepths() {
  if (!process.env.REDIS_URL) return { depths: {}, stall: null as null | Record<string, { overdueJobs: number; oldestAddedAtIso: string | null }> };
  try {
    const { Queue } = await import("bullmq");
    const { Redis } = await import("ioredis");
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
    connection.on("error", () => undefined);
    const depths: Record<string, number> = {};
    // Stall detection: a "delayed" job whose scheduledFor is already in the
    // past means the worker never picked it up — the queue is stuck. We
    // report per-queue "overdue" counts so the frontend can warn when the
    // deployment doesn't have a worker running (a real production bug we hit).
    const stall: Record<string, { overdueJobs: number; oldestAddedAtIso: string | null }> = {};
    const now = Date.now();
    try {
      await connection.connect();
      for (const name of ["email-send", "eta-step", "manual-step", "warmup", "analytics-cron", "csv-import"]) {
        const queue = new Queue(name, { connection });
        const counts = await queue.getJobCounts("wait", "active", "delayed", "failed");
        depths[name] = (counts.wait ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);

        const delayed = await queue.getJobs(["delayed"], 0, 20);
        let overdue = 0;
        let oldestTs: number | null = null;
        for (const job of delayed) {
          const scheduledMs = (job.timestamp ?? 0) + (job.opts?.delay ?? 0);
          if (scheduledMs && scheduledMs < now && (job.attemptsMade ?? 0) === 0) {
            overdue += 1;
            const added = job.timestamp ?? 0;
            if (oldestTs === null || added < oldestTs) oldestTs = added;
          }
        }
        stall[name] = {
          overdueJobs: overdue,
          oldestAddedAtIso: oldestTs ? new Date(oldestTs).toISOString() : null,
        };

        await queue.close();
      }
    } finally {
      connection.disconnect();
    }
    return { depths, stall };
  } catch {
    return { depths: {}, stall: null };
  }
}

app.get("/api/health", async (req, res) => {
  // /api/health used to ping Redis + walk every BullMQ queue on every call.
  // A once-per-minute uptime monitor would rack up ~600k Upstash requests per
  // month — enough to blow past the free tier by itself. The default response
  // is now Postgres-only (cheap, always cached). Pass ?deep=1 to opt into the
  // expensive Redis + queue-depth path when actually debugging.
  const deep = req.query.deep === "1" || req.query.deep === "true";

  const db = await prisma.$queryRaw`SELECT 1`.then(
    () => ({ status: "fulfilled" as const, value: true }),
    (error) => ({ status: "rejected" as const, reason: error as Error }),
  );

  if (!deep) {
    return res.json({
      status: db.status === "fulfilled" ? "ok" : "degraded",
      services: {
        api: "ok",
        db: db.status === "fulfilled" ? "ok" : "error",
        // "deep" checks (Redis, queue depths, worker stall detection) are
        // opt-in — call with ?deep=1 when actively debugging.
        deep: "skipped (pass ?deep=1)",
      },
    });
  }

  const redis = await checkRedisHealth().then(
    (value) => ({ status: "fulfilled" as const, value }),
    (error) => ({ status: "rejected" as const, reason: error as Error }),
  );
  const { depths, stall } = await getQueueDepths();
  // "Stalled" workers are the single largest cause of "campaigns don't send".
  // Roll it up here so operators / the campaign UI can surface it explicitly.
  const stalled = stall
    ? Object.entries(stall).filter(([, entry]) => entry.overdueJobs > 0).map(([queue, entry]) => ({ queue, ...entry }))
    : [];
  const workerStatus = stalled.length > 0
    ? "stalled"
    : workersEnabled
      ? "ok"
      : "disabled";

  res.json({
    status: db.status === "fulfilled" && stalled.length === 0 ? "ok" : "degraded",
    services: {
      api: "ok",
      db: db.status === "fulfilled" ? "ok" : "error",
      redis: redis.status === "fulfilled" && redis.value ? "ok" : "memory-fallback",
      worker: workerStatus,
      queues: depths,
      stalledQueues: stalled,
    },
  });
});

app.use("/auth", authRouter);
app.use("/workspaces", workspaceRouter);
app.use("/api/vessels", vesselRouter);
app.use("/api/companies", companyRouter);
app.use("/api/contacts", contactRouter);
app.use("/api/demo", demoRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/filter", filterRouter);
app.use("/api/saved-filters", savedFilterRouter);
app.use("/api/lists", listRouter);
app.use("/api/saved", savedRouter);
app.use("/api/search", searchRouter);
app.use("/api/import", importRouter);
app.use("/api/inboxes", inboxRouter);
app.use("/api/sending-domains", sendingDomainRouter);
app.use("/api/webhooks", providerWebhookRouter);
app.use("/api/ports", portRouter);
app.use("/api/vessel-etas", vesselEtaRouter);
app.use("/api/port-radar", portRadarRouter);
app.use("/api/port-rules", portRuleRouter);
app.use("/api/cargo-rules", cargoRuleRouter);
app.use("/api/inbound", inboundRouter);
app.use("/api/unsubscribe", unsubscribeRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/admin/maribiz", adminMaribizRouter);
app.use("/api/admin/apollo", adminApolloRouter);
app.use("/api/admin/data-sources", adminDataSourcesRouter);
app.use("/t", trackingRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestError = error as { status?: number; type?: string; body?: unknown };

  if (requestError.status === 413 || requestError.type === "entity.too.large") {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Upload is too large. Maximum request size is ${bodyLimit}.`,
      },
    });
  }

  if (error instanceof SyntaxError && requestError.body !== undefined) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body is not valid JSON",
      },
    });
  }

  console.error(error);

  // Classify common operational failures so the client shows an actionable
  // message rather than a generic "Unexpected server error". Everything else
  // stays generic to avoid leaking internal stack traces / internal paths.
  const rawMsg =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/max requests limit exceeded/i.test(rawMsg)) {
    return res.status(503).json({
      error: {
        code: "REDIS_QUOTA_EXHAUSTED",
        message:
          "Upstash Redis quota is exhausted — no jobs can be queued until the plan is upgraded or the monthly counter resets.",
      },
    });
  }
  if (
    /ECONNREFUSED/i.test(rawMsg) ||
    /connection is closed/i.test(rawMsg) ||
    /ENOTFOUND/i.test(rawMsg)
  ) {
    return res.status(503).json({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message:
          "A backing service (Redis or Postgres) is unreachable — the operation didn't complete. Retry in a moment; if it persists, check REDIS_URL / DATABASE_URL.",
      },
    });
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    },
  });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: webOrigin,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  const workspaceId = typeof socket.handshake.query.workspaceId === "string" ? socket.handshake.query.workspaceId : null;
  if (workspaceId) {
    socket.join(`workspace:${workspaceId}`);
  }
});

setRealtimeServer(io);

if (workersEnabled) {
  startBackendWorkers();
}

server.listen(port, () => {
  console.log(`MariMail server listening on http://localhost:${port}`);
});
