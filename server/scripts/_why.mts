import { prisma } from "@marimail/db";
import { Redis } from "ioredis";

const LIST_ID = "cmsbjgvo30001fn08dano4x3d";
const ist = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Calcutta", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d);

console.log(`now: ${ist(new Date())} IST\n`);

const d = (await prisma.apolloDripJob.findFirst())!;
console.log(`drip: added=${d.added} revealed=${d.revealed} skipped=${d.skipped}`);
console.log(`      cursor p${d.page}+${d.offsetInPage}  lastRun=${d.lastRunAt ? ist(d.lastRunAt) : "never"} (+${d.lastRunAdded})`);
console.log(`      lastError: ${d.lastError ?? "none"}`);
console.log(`      updatedAt: ${ist(d.updatedAt)}`);

const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const lockKey = `apollo-drip:${d.id}:running`;
const held = await redis.exists(lockKey);
const ttl = held ? await redis.ttl(lockKey) : -1;
console.log(`\nrun lock: ${held ? `HELD (${ttl}s left) <-- blocks new runs` : "free"}`);

const listCount = await prisma.listContact.count({ where: { listId: LIST_ID } });
console.log(`list members: ${listCount}`);

const recent = await prisma.listContact.findMany({
  where: { listId: LIST_ID },
  orderBy: { createdAt: "desc" }, take: 3,
  select: { createdAt: true, contact: { select: { email: true } } },
});
console.log("latest additions:");
for (const r of recent) console.log(`  ${ist(r.createdAt)}  ${r.contact.email}`);

const ws = (await prisma.workspace.findUnique({
  where: { id: d.workspaceId }, select: { name: true, creditBalance: true },
}))!;
console.log(`\ncredits (${ws.name}): ${ws.creditBalance}`);

const settings = await prisma.apolloSettings.findFirst({
  select: { enabled: true, apiKey: true, creditsPerEmailReveal: true },
});
console.log(`apollo: enabled=${settings?.enabled} hasKey=${Boolean(settings?.apiKey)} costPerReveal=${settings?.creditsPerEmailReveal}`);

const own = await prisma.workspaceApolloAccount.findMany({
  where: { workspaceId: d.workspaceId },
  select: { label: true, status: true, lastTestError: true },
});
console.log(`workspace apollo accounts: ${own.length ? own.map((a) => `${a.label}(${a.status})`).join(", ") : "none — uses platform key"}`);

redis.disconnect();
await prisma.$disconnect();
process.exit(0);
