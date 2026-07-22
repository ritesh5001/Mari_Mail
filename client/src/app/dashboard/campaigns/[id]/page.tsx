import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Clock,
  Mail,
  Radar,
  Send,
  Ship,
  Users,
} from "lucide-react";
import {
  getCampaignDetailData,
  type CampaignDetailData,
} from "@/lib/campaign-data";
import { SendCampaignNowButton } from "@/components/campaigns/SendCampaignNowButton";
import { CampaignStepBreakdown } from "@/components/campaigns/CampaignStepBreakdown";

export const dynamic = "force-dynamic";

type Campaign = CampaignDetailData["campaign"];
type Sequence = Campaign["sequences"][number];

function formatEnum(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contactName(contact: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return name || contact.email;
}

function statusTone(status: string) {
  if (["ACTIVE", "SENT", "OPENED", "CLICKED", "REPLIED"].includes(status)) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (["FAILED", "BOUNCED", "UNSUBSCRIBED", "ERROR"].includes(status)) {
    return "bg-red-100 text-red-700";
  }
  if (["SCHEDULED", "PENDING", "PAUSED"].includes(status)) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}

function eventCounts(events: Campaign["emailEvents"]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }
  return counts;
}

type UnenrolledContact = {
  id: string;
  email: string;
  emailStatus?: string | null;
  source?: string | null;
  verified?: boolean | null;
};

/**
 * Explain to the user why a specific target contact hasn't been enrolled into
 * scheduled sends. The recipient table shows this inline so "not launched yet"
 * turns into an actionable diagnosis instead of a generic label.
 */
function targetWaitingReason(
  campaign: Campaign,
  contact: UnenrolledContact,
  targetVesselCount: number,
  vesselsWithFutureEta: number,
): { headline: string; hint?: string } {
  // Contact-level exclusions first — these apply regardless of trigger type
  // and the fix is always on the contact, not the campaign.
  if (contact.email.endsWith("@unknown.local")) {
    return {
      headline: "Locked contact",
      hint: "Reveal the email in People Finder (1 credit) so it becomes sendable.",
    };
  }
  if (contact.emailStatus === "INVALID") {
    return {
      headline: "Email marked INVALID — will not send",
      hint: "Update or re-verify the contact's email before it can enroll.",
    };
  }
  if (contact.source === "APOLLO" && contact.verified === false) {
    return {
      headline: "External preview — unverified",
      hint: "Reveal the contact in People Finder to verify and enroll.",
    };
  }

  // Campaign-level explanations for trigger-driven flows
  if (campaign.triggerType === "ETA_BASED") {
    const hasRules = campaign.portRules.length > 0 || campaign.cargoTriggers.length > 0;
    if (!hasRules && targetVesselCount === 0) {
      return {
        headline: "No vessels in target list",
        hint: "Add vessels to this campaign's target list from the ETA Radar. Every ETA on those vessels will fire the campaign.",
      };
    }
    if (targetVesselCount > 0) {
      // No future ETA anywhere in the target list means every ETA on those
      // vessels has already passed — the campaign literally cannot fire until
      // fresh ETA data lands (via a new CSV or the ETA-import flow). Say so
      // explicitly instead of the misleading "Waiting for ETA" reason, which
      // reads as if it's about to happen any moment.
      if (vesselsWithFutureEta === 0) {
        return {
          headline: "All ETAs on target vessels are in the past",
          hint: `${targetVesselCount} vessel${targetVesselCount === 1 ? "" : "s"} in the target list, but every ETA on file is expired. Upload a fresh ETA CSV (or add an ETA on the vessel) so the campaign can fire.`,
        };
      }
      return {
        headline: "Waiting for ETA on your vessels",
        hint: `${vesselsWithFutureEta} of ${targetVesselCount} vessel${targetVesselCount === 1 ? "" : "s"} in the target list ${vesselsWithFutureEta === 1 ? "has" : "have"} a future ETA. This recipient will enroll when a matching one fires.`,
      };
    }
    return {
      headline: "Waiting for matching ETA",
      hint: "This recipient will enroll when a new ETA lands at one of this campaign's rule ports.",
    };
  }

  if (campaign.triggerType === "MANUAL") {
    if (campaign.status === "DRAFT") {
      return {
        headline: "Campaign is still a draft",
        hint: "Click Launch in the campaign editor to enroll all target contacts.",
      };
    }
    if (campaign.contacts.length === 0) {
      return {
        headline: "Campaign is ACTIVE but has never enrolled anyone",
        hint: "Re-open the editor and click Enroll list — this happens when trigger type was switched from ETA to Manual without re-launching.",
      };
    }
    return {
      headline: "Added to the target list after the last launch",
      hint: "Click Send now to fire Step 1 to this contact right now, or re-launch to enrol everyone the resolver currently returns.",
    };
  }

  return {
    headline: "Waiting for matching trigger",
    hint: "This trigger type enrols contacts when the configured event fires.",
  };
}

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getCampaignDetailData(params.id);
  if (!data) notFound();

  const { campaign, targetConfig, targetContacts, targetLists, targetVessels, stepBreakdown } = data;
  const targetVesselCount = targetVessels.length;
  // `nextEta` on each target vessel is only populated when there's a FUTURE
  // ETA on file (see [campaign-data.ts:564]). So "how many can actually fire"
  // is just the count of vessels whose nextEta is not null.
  const vesselsWithFutureEta = targetVessels.filter((vessel) => vessel.nextEta !== null).length;
  const counts = eventCounts(campaign.emailEvents);
  const enrolledContactIds = new Set(
    campaign.contacts.map((row) => row.contactId),
  );
  const targetOnlyContacts = targetContacts.filter(
    (contact) => !enrolledContactIds.has(contact.id),
  );
  const totalRecipients = campaign.contacts.length + targetOnlyContacts.length;

  // Flat recipient list passed into the "Send now" picker — enrolled rows
  // first, then target-only rows. Each entry carries enough info for the
  // modal to show a useful label and disable already-sent contacts.
  const sendNowRecipients = [
    ...campaign.contacts.map((row) => ({
      contactId: row.contactId,
      email: row.contact.email,
      name: contactName(row.contact),
      companyName: row.contact.companyName ?? null,
      status: row.status as string,
    })),
    ...targetOnlyContacts.map((contact) => ({
      contactId: contact.id,
      email: contact.email,
      name: contactName(contact),
      companyName: contact.companyName ?? null,
      status: "TARGET",
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={campaign.triggerType === "MANUAL" ? "/dashboard/campaigns/cold" : "/dashboard/campaigns/eta"}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ocean"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {campaign.triggerType === "MANUAL" ? "cold" : "ETA"} campaigns
        </Link>
        <div className="flex items-start gap-2">
          <Link
            href={`/dashboard/campaigns/${campaign.id}/edit`}
            className="inline-flex items-center gap-2 rounded-md bg-[#4F6DFF] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3B4FE6]"
          >
            Edit campaign
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/analytics`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-ocean/30 hover:text-ocean"
          >
            <Activity className="h-4 w-4" />
            Analytics
          </Link>
          <SendCampaignNowButton campaignId={campaign.id} recipients={sendNowRecipients} />
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-ocean/10 p-2 text-ocean">
              <Radar className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-slate-950">
                  {campaign.name}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(campaign.status)}`}
                >
                  {campaign.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {campaign.description || "No description added."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <Badge label={formatEnum(campaign.triggerType)} />
                <Badge label={formatEnum(campaign.sendingMode)} />
                <Badge label={`${campaign.dailyLimit} daily limit`} />
                <Badge label={campaign.timezone} />
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Recipients" value={totalRecipients.toString()} />
            <Stat label="Steps" value={campaign.sequences.length.toString()} />
            <Stat label="Events" value={campaign._count.emailEvents.toString()} />
            <Stat label="Triggers" value={campaign._count.etaTriggers.toString()} />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-ocean" />
            <h3 className="text-lg font-semibold text-slate-950">
              Who will receive which mail
            </h3>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Every step of the sequence, with how many mails it holds and how many
            have gone out. Open a step to see each mail and its send time.
          </p>
          {campaign.contacts.length === 0 && targetOnlyContacts.length > 0 ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {campaign.triggerType === "ETA_BASED" && campaign.portRules.length === 0 && campaign.cargoTriggers.length === 0 && targetVesselCount === 0
                ? <>
                    Target contacts are present, but this ETA campaign has <strong>no vessels in its target list</strong>. No ETA can ever match it, so it will never enroll or send.
                    {" "}
                    <Link href={`/dashboard/campaigns/${campaign.id}/edit?tab=leads`} className="font-semibold underline">
                      Add vessels from the ETA Radar
                    </Link>{" "}or switch to <strong>Manual</strong> trigger.
                  </>
                : campaign.triggerType === "ETA_BASED"
                  ? targetVesselCount > 0
                    ? vesselsWithFutureEta === 0
                      ? `Target contacts are present, but every ETA on the ${targetVesselCount} vessel${targetVesselCount === 1 ? "" : "s"} in the target list has already passed. Upload a fresh ETA CSV so this campaign can fire.`
                      : `Target contacts are present. ${vesselsWithFutureEta} of ${targetVesselCount} vessel${targetVesselCount === 1 ? "" : "s"} in the target list ${vesselsWithFutureEta === 1 ? "has" : "have"} a future ETA — enrolment fires when a matching one lands.`
                    : "Target contacts are present, but this ETA campaign has no matching ETA trigger yet. It will not send until an ETA matches the campaign rule and enrolls contacts."
                  : campaign.triggerType === "MANUAL"
                    ? <>
                        Target contacts are present, but this manual campaign hasn&rsquo;t enrolled them into scheduled sends yet.{" "}
                        <Link href={`/dashboard/campaigns/${campaign.id}/edit`} className="font-semibold underline">
                          Edit campaign
                        </Link>{" "}and hit <strong>Enroll list</strong> to schedule all {targetOnlyContacts.length} recipients, or use <strong>Send now</strong> for a specific subset.
                      </>
                    : "Target contacts are present, but no matching trigger has enrolled them into scheduled sends yet."}
            </div>
          ) : null}
          <CampaignStepBreakdown steps={stepBreakdown} campaignId={campaign.id} />

          {targetOnlyContacts.length > 0 ? (
            <div className="mt-5">
              <h4 className="text-sm font-semibold text-slate-950">
                Not enrolled yet ({targetOnlyContacts.length})
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Configured targets that haven&rsquo;t been enrolled into a send job, so
                they don&rsquo;t appear in any step above.
              </p>
              <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Recipient</th>
                      <th className="px-3 py-2">Why it hasn&rsquo;t sent</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetOnlyContacts.map((contact) => {
                      const reason = targetWaitingReason(campaign, contact, targetVesselCount, vesselsWithFutureEta);
                      // ETA campaigns with vessels but zero future ETAs are
                      // stuck, not "waiting" — reflect that in the pill too.
                      const stuckOnPastEtas =
                        campaign.triggerType === "ETA_BASED" &&
                        targetVesselCount > 0 &&
                        vesselsWithFutureEta === 0;
                      return (
                        <tr key={contact.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-950">{contactName(contact)}</p>
                            <p className="text-xs text-slate-500">{contact.email}</p>
                            <p className="text-xs text-slate-400">{contact.companyName}</p>
                          </td>
                          <td className="max-w-md px-3 py-3">
                            <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-900">
                              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                              {reason.headline}
                            </p>
                            {reason.hint ? (
                              <p className="mt-0.5 pl-4 text-[11px] text-amber-800">{reason.hint}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                stuckOnPastEtas
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {campaign.triggerType === "ETA_BASED"
                                ? stuckOnPastEtas
                                  ? "ETA EXPIRED"
                                  : "WAITING ETA"
                                : "TARGET"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {campaign.contacts.length === 0 && targetOnlyContacts.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500">
              {targetConfig.contactListIds.length === 0 && targetConfig.contactIds.length === 0
                ? <>No recipients configured. Bind a contact list under <strong>Edit campaign &rarr; Leads</strong>.</>
                : campaign.triggerType === "MANUAL"
                  ? <>The list is bound but the resolver returned zero eligible contacts. Common causes: every contact is a locked preview (@unknown.local), every contact has emailStatus=INVALID, or every contact is on the workspace suppression list.</>
                  : campaign.triggerType === "ETA_BASED" && campaign.portRules.length === 0 && targetVesselCount === 0
                    ? <>ETA campaign has no vessels in its target list &mdash; no ETA can match. Add vessels from the ETA Radar to a list, then bind that list under <strong>Edit campaign &rarr; Leads</strong>.</>
                    : "Recipients enrol when the trigger fires. No matching event yet."}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-ocean" />
              <h3 className="text-lg font-semibold text-slate-950">
                Targeting
              </h3>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow
                label="Roles"
                value={
                  targetConfig.roles.length
                    ? targetConfig.roles.map(formatEnum).join(", ")
                    : "No role targeting"
                }
              />
              <InfoRow
                label="Contact lists"
                value={
                  targetLists.length
                    ? targetLists
                        .map((list) => `${list.name} (${list.contactCount})`)
                        .join(", ")
                    : "No list targeting"
                }
              />
              <InfoRow
                label="Target contacts"
                value={
                  targetContacts.length
                    ? targetContacts.length.toString()
                    : "No direct contacts"
                }
              />
              <InfoRow
                label="Stop rules"
                value={[
                  campaign.stopOnReply ? "reply" : null,
                  campaign.stopOnBounce ? "bounce" : null,
                  campaign.stopOnUnsubscribe ? "unsubscribe" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-ocean" />
              <h3 className="text-lg font-semibold text-slate-950">
                Event summary
              </h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {["SENT", "OPENED", "CLICKED", "REPLIED", "BOUNCED_HARD", "FAILED"].map(
                (event) => (
                  <Stat
                    key={event}
                    label={formatEnum(event)}
                    value={(counts.get(event) ?? 0).toString()}
                  />
                ),
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-ocean" />
          <h3 className="text-lg font-semibold text-slate-950">
            Message sequence
          </h3>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {campaign.sequences.map((sequence) => (
            <SequenceCard key={sequence.id} sequence={sequence} />
          ))}
          {campaign.sequences.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
              No message steps configured.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TriggerPanel campaign={campaign} />
        <RecentEvents campaign={campaign} />
      </section>
    </div>
  );
}

function SequenceCard({ sequence }: { sequence: Sequence }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step {sequence.stepOrder}
          </p>
          <h4 className="mt-1 font-semibold text-slate-950">
            {sequence.subject}
          </h4>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
          {sequence.delayType === "DAYS_BEFORE_ETA"
            ? `${sequence.delayValue}d before ETA`
            : `+${sequence.delayValue}d`}
        </span>
      </div>
      <p className="mt-3 line-clamp-4 text-sm text-slate-600">
        {stripHtml(sequence.bodyHtml) || "No body content."}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <InfoBox label="Condition" value={formatEnum(sequence.conditionType)} />
        <InfoBox
          label="Usage"
          value={`${sequence._count.campaignContacts} contacts, ${sequence._count.emailEvents} events`}
        />
      </dl>
      {sequence.abTestEnabled ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          A/B enabled. Subject B: {sequence.abSubjectB || "-"}
        </div>
      ) : null}
    </article>
  );
}

function TriggerPanel({ campaign }: { campaign: Campaign }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Ship className="h-5 w-5 text-ocean" />
        <h3 className="text-lg font-semibold text-slate-950">
          ETA triggers and rules
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {campaign.etaTriggers.map((trigger) => (
          <div
            key={trigger.id}
            className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-950">
                  {trigger.vessel.vesselName}
                </p>
                <p className="text-xs text-slate-500">
                  IMO {trigger.vessel.imoNumber} -{" "}
                  {trigger.vesselEta.destinationPortName}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(trigger.status)}`}
              >
                {trigger.status}
              </span>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              <span>ETA {formatDate(trigger.vesselEta.eta)}</span>
              <span>Next fire {formatDate(trigger.nextFireAt)}</span>
              <span>{trigger.campaignContacts.length} contacts</span>
            </div>
          </div>
        ))}
        {campaign.etaTriggers.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            No ETA triggers have matched this campaign yet.
          </div>
        ) : null}
        {campaign.portRules.length || campaign.cargoTriggers.length ? (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
            {campaign.portRules.map((rule) => (
              <p key={rule.id}>
                Port rule: {rule.port?.portName ?? rule.portCode} - priority{" "}
                {rule.priority}
              </p>
            ))}
            {campaign.cargoTriggers.map((rule) => (
              <p key={rule.id}>
                Cargo rule: {rule.previousCargo.join(", ") || "ANY"} to{" "}
                {rule.nextCargo.join(", ") || "ANY"}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RecentEvents({ campaign }: { campaign: Campaign }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-ocean" />
        <h3 className="text-lg font-semibold text-slate-950">
          Recent email events
        </h3>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Step</th>
              <th className="px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {campaign.emailEvents.slice(0, 20).map((event) => (
              <tr key={event.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(event.eventType)}`}
                  >
                    {formatEnum(event.eventType)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {event.contact ? contactName(event.contact) : "-"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {event.sequence ? `Step ${event.sequence.stepOrder}` : "-"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {formatDate(event.occurredAt)}
                </td>
              </tr>
            ))}
            {campaign.emailEvents.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-sm text-slate-500"
                >
                  No events yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-navy">{value}</dd>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
      {label}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 pb-2 last:border-0">
      <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-slate-700">{value || "-"}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-slate-700">{value}</dd>
    </div>
  );
}
