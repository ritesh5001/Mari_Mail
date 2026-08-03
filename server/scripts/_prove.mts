import { prisma } from "@marimail/db";
import { runApolloDrip } from "../src/services/apollo-drip.service.js";
import { matchCallsInLastHour } from "../src/services/apollo/rate-limit.js";

const d0 = (await prisma.apolloDripJob.findFirst())!;
const list0 = await prisma.listContact.count({ where: { listId: d0.listId } });
const ws0 = (await prisma.workspace.findUnique({ where: { id: d0.workspaceId }, select: { creditBalance: true } }))!;
const camp = (await prisma.campaign.findFirst({ where: { status: "ACTIVE", triggerType: "MANUAL" }, select: { id: true } }))!;
const enrol0 = await prisma.campaignContact.count({ where: { campaignId: camp.id } });
console.log(`before: list=${list0} enrolled=${enrol0} credits=${ws0.creditBalance} cursor=p${d0.page}+${d0.offsetInPage}`);
console.log(`match calls used this hour: ${await matchCallsInLastHour("platform")}\n`);

const t0 = Date.now();
const r = await runApolloDrip(d0.id);
console.log(`\nresult: ${JSON.stringify(r)}`);
console.log(`took ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const d1 = (await prisma.apolloDripJob.findUnique({ where: { id: d0.id } }))!;
const list1 = await prisma.listContact.count({ where: { listId: d0.listId } });
const ws1 = (await prisma.workspace.findUnique({ where: { id: d0.workspaceId }, select: { creditBalance: true } }))!;
const enrol1 = await prisma.campaignContact.count({ where: { campaignId: camp.id } });
console.log(`\nafter : list=${list1} (+${list1 - list0})  enrolled=${enrol1} (+${enrol1 - enrol0})`);
console.log(`credits ${ws0.creditBalance} -> ${ws1.creditBalance} (spent ${ws0.creditBalance - ws1.creditBalance})`);
console.log(`cursor p${d1.page}+${d1.offsetInPage}   added=${d1.added} skipped=${d1.skipped}`);
console.log(`match calls used this hour: ${await matchCallsInLastHour("platform")} / 200`);
console.log(`lastError: ${d1.lastError ?? "none"}`);
await prisma.$disconnect(); process.exit(0);
