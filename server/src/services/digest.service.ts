import { prisma } from "@marimail/db";
import { sendTransactionalEmail } from "@marimail/email";
import { getOverviewKpis } from "./analytics.service.js";

export async function sendWeeklyDigests() {
  const workspaces = await prisma.workspace.findMany({
    where: { onboardedAt: { not: null } },
    select: {
      id: true,
      name: true,
      owner: { select: { email: true, name: true } },
    },
  });

  let sent = 0;
  for (const workspace of workspaces) {
    if (!workspace.owner?.email) continue;
    const overview = await getOverviewKpis(workspace.id, 7);
    const html = renderDigestHtml(workspace.name, overview);
    try {
      await sendTransactionalEmail({
        to: workspace.owner.email,
        subject: `MariMail weekly digest — ${workspace.name}`,
        html,
      });
      sent += 1;
    } catch (error) {
      console.error(`weekly digest send failed for workspace ${workspace.id}:`, error);
    }
  }
  return { workspaces: workspaces.length, sent };
}

function renderDigestHtml(workspaceName: string, overview: Awaited<ReturnType<typeof getOverviewKpis>>) {
  const { cards } = overview;
  return `<!doctype html>
<html><body style="font-family:Inter,system-ui;background:#f8fafc;padding:24px;color:#0f172a">
  <h1 style="color:#0A2342;margin-bottom:4px">${workspaceName}</h1>
  <p style="color:#475569;margin-top:0">Weekly MariMail digest · last 7 days</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:16px">
    ${kpiRow("Vessels tracked (this month)", cards.vesselsTracked.value, `${cards.vesselsTracked.trend > 0 ? "+" : ""}${cards.vesselsTracked.trend}% MoM`)}
    ${kpiRow("ETAs this week", cards.etasThisWeek.value)}
    ${kpiRow("Active campaigns", cards.activeCampaigns.value, `${cards.activeCampaigns.newThisMonth} new this month`)}
    ${kpiRow("Emails sent (7d)", cards.emailsSent.value, `${cards.emailsSent.trend > 0 ? "+" : ""}${cards.emailsSent.trend}% vs prior 7d`)}
    ${kpiRow("Avg reply rate", `${(cards.avgReplyRate.value * 100).toFixed(1)}%`)}
    ${kpiRow("Missed opportunities (<48h)", cards.missedOpportunities.value)}
  </table>
  <p style="margin-top:24px;color:#475569;font-size:13px">Open MariMail to explore your full analytics dashboard.</p>
</body></html>`;
}

function kpiRow(label: string, value: string | number, sub?: string) {
  return `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
      <div style="color:#64748b;font-size:12px;letter-spacing:.03em;text-transform:uppercase">${label}</div>
      <div style="color:#0A2342;font-size:24px;font-weight:600">${value}</div>
      ${sub ? `<div style="color:#0077B6;font-size:12px;margin-top:2px">${sub}</div>` : ""}
    </td>
  </tr>`;
}
