import { prisma } from "@marimail/db";
import { runApolloDrip } from "../src/services/apollo-drip.service.js";

const d = (await prisma.apolloDripJob.findFirst())!;
console.log(`before: added=${d.added} skipped=${d.skipped} cursor=p${d.page}+${d.offsetInPage} status=${d.status}`);
const listBefore = await prisma.listContact.count({ where: { listId: d.listId } });
const ws0 = (await prisma.workspace.findUnique({ where: { id: d.workspaceId }, select: { creditBalance: true } }))!;
console.log(`list=${listBefore} credits=${ws0.creditBalance}\n`);

const t0 = Date.now();
const r = await runApolloDrip(d.id);
console.log(`\nresult: ${JSON.stringify(r)}  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const after = (await prisma.apolloDripJob.findUnique({ where: { id: d.id } }))!;
const listAfter = await prisma.listContact.count({ where: { listId: d.listId } });
const ws1 = (await prisma.workspace.findUnique({ where: { id: d.workspaceId }, select: { creditBalance: true } }))!;
console.log(`after : added=${after.added} skipped=${after.skipped} cursor=p${after.page}+${after.offsetInPage} status=${after.status}`);
console.log(`list=${listAfter} (+${listAfter - listBefore})  credits=${ws1.creditBalance} (-${ws0.creditBalance - ws1.creditBalance})`);
console.log(`lastError: ${after.lastError ?? "none"}`);
await prisma.$disconnect();
process.exit(0);
