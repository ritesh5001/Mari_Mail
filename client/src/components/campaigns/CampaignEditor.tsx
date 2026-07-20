"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Reply,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Ship,
  Sliders,
  Trash2,
  Users,
} from "lucide-react";
import type { CampaignDetailData } from "@/lib/campaign-data";
import type { ContactListModel } from "@/lib/contact-data";
import { apiFetch } from "@/lib/browser-fetch";
import { CampaignSentTab } from "@/components/campaigns/CampaignSentTab";
import { InboxPicker } from "@/components/campaigns/InboxPicker";
import { MergeTagField } from "@/components/campaigns/MergeTagField";
import { StagedReviewPanel } from "@/components/campaigns/StagedReviewPanel";
import { ApolloVesselSearchModal } from "@/components/campaigns/ApolloVesselSearchModal";

type Campaign = CampaignDetailData["campaign"];

type SequenceForm = {
  id: string; // client-side row id (not persisted as-is)
  stepOrder: number;
  subject: string;
  bodyHtml: string;
  delayType: "FIXED_DAYS" | "DAYS_BEFORE_ETA";
  delayValue: number;
  conditionType: "ALWAYS" | "IF_NOT_OPENED" | "IF_NOT_REPLIED";
};

type TabKey = "analytics" | "leads" | "sequences" | "options" | "sent";

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "analytics", label: "Analytics", icon: <Activity className="h-4 w-4" /> },
  { key: "leads", label: "Leads", icon: <Users className="h-4 w-4" /> },
  { key: "sequences", label: "Sequences", icon: <Mail className="h-4 w-4" /> },
  { key: "options", label: "Options", icon: <Sliders className="h-4 w-4" /> },
  { key: "sent", label: "Sent", icon: <Send className="h-4 w-4" /> },
];

// Ordered wizard flow — Analytics is intentionally excluded (post-launch view).
const WIZARD_STEPS: TabKey[] = ["leads", "sequences", "options"];

function generateId() {
  return Math.random().toString(36).slice(2);
}

type MatchedVessel = {
  id: string;
  vesselName: string;
  imoNumber: string;
  nextEta: string | null;
  nextEtaPort: string | null;
};

/** Short UTC ETA label, e.g. "14 Jul, 12:30" — used in the highlighted ETA pill. */
function formatEtaShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Highlighted ship + ETA cell shared by the recipient preview and enrolled
 * tables. Shows each matched vessel as a chip with its next-ETA badge (the
 * moment the campaign fires for that contact via that ship).
 */
function ShipEtaCell({ vessels }: { vessels: MatchedVessel[] }) {
  if (vessels.length === 0) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
        title="No company/domain signal links this contact to any vessel in the list — ETA triggers will skip them."
      >
        No vessel match
      </span>
    );
  }
  return (
    <div className="flex max-w-[280px] flex-col gap-1">
      {vessels.map((vessel) => {
        const eta = formatEtaShort(vessel.nextEta);
        return (
          <div key={vessel.id} className="flex flex-wrap items-center gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean"
              title={`IMO ${vessel.imoNumber}`}
            >
              <Ship className="h-3 w-3" />
              {vessel.vesselName || vessel.imoNumber}
            </span>
            {eta ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40"
                title={`Next ETA${vessel.nextEtaPort ? ` — ${vessel.nextEtaPort}` : ""} (UTC)`}
              >
                <Clock className="h-3 w-3" />
                ETA {eta}
                {vessel.nextEtaPort ? ` · ${vessel.nextEtaPort}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                No upcoming ETA
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CampaignEditor({
  campaign,
  targetContacts,
  targetLists,
  targetVessels,
  stagedGroups,
  lists,
  initialTab,
}: {
  campaign: Campaign;
  targetContacts: CampaignDetailData["targetContacts"];
  targetLists: CampaignDetailData["targetLists"];
  targetVessels: CampaignDetailData["targetVessels"];
  stagedGroups: CampaignDetailData["stagedGroups"];
  lists: ContactListModel[];
  initialTab: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(() => {
    // Legacy URLs may still link to ?tab=schedule (now merged into options)
    // or ?tab=subsequences (removed). Redirect those in-place.
    if (initialTab === "schedule") return "options";
    return TABS.some((entry) => entry.key === initialTab) ? (initialTab as TabKey) : "leads";
  });
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Editable state -------------------------------------------------------
  const [name, setName] = useState(campaign.name);
  // Only MANUAL and ETA_BASED are user-selectable now. Legacy PORT_BASED /
  // VESSEL_TYPE_BASED / CARGO_CHANGE campaigns collapse to ETA_BASED — the
  // vessel-in-list matcher covers those cases too.
  const [triggerType] = useState<Campaign["triggerType"]>(
    campaign.triggerType === "MANUAL" ? "MANUAL" : "ETA_BASED",
  );

  const [contactListId, setContactListId] = useState<string>(() => {
    const raw = (campaign.targetConfig ?? {}) as { contactListIds?: unknown };
    const ids = Array.isArray(raw.contactListIds) ? raw.contactListIds : [];
    return typeof ids[0] === "string" ? (ids[0] as string) : "";
  });

  const [sequences, setSequences] = useState<SequenceForm[]>(() => {
    // Force every step's delay semantics to match the campaign's trigger at
    // load time — this repairs any legacy mixed-mode sequences the DB carries.
    const forcedDelayType: SequenceForm["delayType"] =
      campaign.triggerType === "MANUAL" ? "FIXED_DAYS" : "DAYS_BEFORE_ETA";
    return campaign.sequences.length
      ? campaign.sequences.map((seq) => ({
          id: seq.id,
          stepOrder: seq.stepOrder,
          subject: seq.subject,
          bodyHtml: seq.bodyHtml,
          delayType: forcedDelayType,
          delayValue: seq.delayValue,
          conditionType: (seq.conditionType as SequenceForm["conditionType"]) ?? "ALWAYS",
        }))
      : [
          {
            id: generateId(),
            stepOrder: 1,
            subject: "",
            bodyHtml: "",
            delayType: forcedDelayType,
            delayValue: 0,
            conditionType: "ALWAYS",
          },
        ];
  });

  const [scheduleDays, setScheduleDays] = useState<number[]>(campaign.scheduleDays);
  const [hourStart, setHourStart] = useState(campaign.scheduleHourStart);
  const [hourEnd, setHourEnd] = useState(campaign.scheduleHourEnd);
  const [timezone, setTimezone] = useState(campaign.timezone);

  const [dailyLimit, setDailyLimit] = useState(campaign.dailyLimit);
  const [sendGapSeconds, setSendGapSeconds] = useState(campaign.sendGapSeconds);
  const [sendGapMaxSeconds, setSendGapMaxSeconds] = useState(campaign.sendGapMaxSeconds);
  const [trackOpens, setTrackOpens] = useState(campaign.trackOpens);
  const [trackClicks, setTrackClicks] = useState(campaign.trackClicks);
  // Preserved server-side but no longer editable in the UI — the user asked
  // to remove the toggle. If a campaign already had this enabled, keep it on.
  const [stopOnReply] = useState(campaign.stopOnReply);
  const [stopOnBounce, setStopOnBounce] = useState(campaign.stopOnBounce);
  const [stopOnUnsubscribe, setStopOnUnsubscribe] = useState(campaign.stopOnUnsubscribe);
  const [rotationStrategy, setRotationStrategy] = useState(campaign.rotationStrategy);
  const [fromAccountIds, setFromAccountIds] = useState<string[]>(campaign.fromAccountIds);
  // Once launched, sending routing is locked to whatever was chosen at launch.
  const inboxSelectionLocked = campaign.status !== "DRAFT";

  // ---- Save + activate ------------------------------------------------------
  async function save(overrides?: { status?: Campaign["status"] }) {
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: name.trim() || "Untitled campaign",
        status: overrides?.status ?? campaign.status,
        triggerType,
        sendingMode: campaign.sendingMode,
        fromAccountIds,
        rotationStrategy,
        dailyLimit,
        sendGapSeconds,
        sendGapMaxSeconds,
        timezone,
        scheduleDays,
        scheduleHourStart: hourStart,
        scheduleHourEnd: hourEnd,
        trackOpens,
        trackClicks,
        stopOnReply,
        stopOnBounce,
        stopOnUnsubscribe,
        tags: campaign.tags,
        targetConfig: {
          ...(campaign.targetConfig as Record<string, unknown>),
          contactListIds: contactListId ? [contactListId] : [],
        },
        triggerConfig: campaign.triggerConfig,
        sequences: sequences.map((seq, idx) => ({
          stepOrder: idx + 1,
          subject: seq.subject || "(empty)",
          bodyHtml: seq.bodyHtml || " ",
          delayType: seq.delayType,
          delayValue: seq.delayValue,
          conditionType: seq.conditionType,
        })),
      };

      const res = await apiFetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(payload.error?.message ?? "Failed to save campaign");
        return false;
      }
      startTransition(() => router.refresh());
      setToast("Saved");
      setTimeout(() => setToast(null), 2000);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function launch() {
    const ok = await save({ status: "DRAFT" });
    if (!ok) return;
    setSaving(true);
    try {
      const path = triggerType === "MANUAL" ? "launch" : "activate";
      const res = await apiFetch(`/api/campaigns/${campaign.id}/${path}`, { method: "POST" });
      const payload = (await res.json()) as {
        error?: { message?: string };
        data?: { scheduled?: number; contacts?: number };
      };
      if (!res.ok) {
        setError(payload.error?.message ?? "Failed to launch campaign");
        return;
      }
      setToast(
        `Launched · ${payload.data?.contacts ?? 0} recipients enrolled${
          payload.data?.scheduled ? ` · ${payload.data.scheduled} sends scheduled` : ""
        }`,
      );
      setTimeout(() => setToast(null), 4000);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setError(null);
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to delete campaign");
        return;
      }
      // Push back to the type-specific list — the row is gone, staying on
      // this URL would 404.
      router.push(campaign.triggerType === "MANUAL" ? "/dashboard/campaigns/cold" : "/dashboard/campaigns/eta");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  // ---- Header ---------------------------------------------------------------
  return (
    <div className="space-y-5">
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={campaign.triggerType === "MANUAL" ? "/dashboard/campaigns/cold" : "/dashboard/campaigns/eta"}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06]"
            aria-label="Back to campaigns"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <CampaignNameField
            name={name}
            onName={setName}
            savedName={campaign.name}
            onSave={save}
          />
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(campaign.status)}`}
          >
            {campaign.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
              <span>Delete this campaign?</span>
              <button
                type="button"
                onClick={remove}
                disabled={deleting || saving || pending}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs font-medium text-red-900 hover:underline dark:text-red-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={saving || pending || deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-60 dark:border-white/10 dark:text-red-300 dark:hover:bg-red-500/10"
              title="Delete this campaign — removes all recipients, events, and scheduled sends"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => save()}
            disabled={saving || pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.06]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-white/10">
        {TABS.map((entry) => {
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border-ocean text-ocean"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Wizard Previous / Save-and-Next nav — sits above the step body so
          users see it without scrolling. Hidden on Analytics (post-launch). */}
      {tab !== "analytics" ? (
        <WizardNav
          currentStep={tab as (typeof WIZARD_STEPS)[number]}
          onGoTo={setTab}
          onSaveAndNext={async (nextStep) => {
            const ok = await save();
            if (ok) setTab(nextStep);
          }}
          onLaunch={launch}
          canLaunch={campaign.status === "DRAFT" || (triggerType === "MANUAL" && campaign.contacts.length === 0)}
          launching={saving || pending}
          launchLabel={campaign.status === "DRAFT" ? "Launch" : "Enroll list"}
        />
      ) : null}

      {/* Tab body */}
      <div className="pb-6">
        {tab === "analytics" && (
          <AnalyticsTab campaign={campaign} targetContacts={targetContacts} />
        )}
        {tab === "leads" && (
          <LeadsTab
            campaign={campaign}
            lists={lists}
            targetLists={targetLists}
            targetContacts={targetContacts}
            targetVessels={targetVessels}
            stagedGroups={stagedGroups}
            contactListId={contactListId}
            onContactListId={setContactListId}
          />
        )}
        {tab === "sequences" && (
          <SequencesTab
            sequences={sequences}
            onSequences={setSequences}
            triggerType={triggerType}
          />
        )}
        {tab === "options" && (
          <div className="space-y-6">
            <ScheduleTab
              scheduleDays={scheduleDays}
              onScheduleDays={setScheduleDays}
              hourStart={hourStart}
              onHourStart={setHourStart}
              hourEnd={hourEnd}
              onHourEnd={setHourEnd}
              timezone={timezone}
              onTimezone={setTimezone}
            />
            <OptionsTab
              dailyLimit={dailyLimit}
              onDailyLimit={setDailyLimit}
              sendGapSeconds={sendGapSeconds}
              onSendGapSeconds={setSendGapSeconds}
              sendGapMaxSeconds={sendGapMaxSeconds}
              onSendGapMaxSeconds={setSendGapMaxSeconds}
              trackOpens={trackOpens}
              onTrackOpens={setTrackOpens}
              trackClicks={trackClicks}
              onTrackClicks={setTrackClicks}
              stopOnBounce={stopOnBounce}
              onStopOnBounce={setStopOnBounce}
              stopOnUnsubscribe={stopOnUnsubscribe}
              onStopOnUnsubscribe={setStopOnUnsubscribe}
              rotationStrategy={rotationStrategy}
              onRotationStrategy={setRotationStrategy}
              fromAccountIds={fromAccountIds}
              onFromAccountIds={setFromAccountIds}
              inboxSelectionLocked={inboxSelectionLocked}
            />
          </div>
        )}
        {tab === "sent" && <CampaignSentTab campaignId={campaign.id} />}
      </div>
    </div>
  );
}

// The campaign header used to show a plain text input for the name — users
// kept forgetting to actually rename their campaign and shipped launches
// titled "Untitled ETA campaign". This wraps the input with three cues:
//   • auto-focus + select-all when the name still starts with "Untitled",
//   • a pencil hint on the border so it obviously looks editable,
//   • a "Press Enter to save" chip that lights up while the value is dirty,
//     and Enter (or blur) actually persists via save().
function CampaignNameField({
  name,
  onName,
  savedName,
  onSave,
}: {
  name: string;
  onName: (value: string) => void;
  savedName: string;
  onSave: () => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const needsRename = /^untitled/i.test(name.trim());
  const dirty = name.trim() !== savedName.trim();

  useEffect(() => {
    if (needsRename && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    // Only auto-focus on first mount, hence empty deps by design.
  }, []);

  async function commit() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2">
        <Pencil className={`h-4 w-4 shrink-0 ${needsRename ? "animate-pulse text-ocean" : "text-slate-400"}`} />
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => onName(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
              inputRef.current?.blur();
            }
          }}
          placeholder="Click here to name your campaign"
          aria-label="Campaign name"
          className={`min-w-0 rounded-md border-b-2 bg-transparent px-2 py-1 text-2xl font-semibold text-slate-950 outline-none transition-colors focus:border-ocean focus:bg-white dark:text-white dark:focus:border-accent-400 dark:focus:bg-white/[0.06] ${
            needsRename ? "border-ocean/60" : "border-transparent hover:border-slate-200"
          }`}
        />
      </div>
      <p
        className={`ml-6 mt-1 text-[11px] font-medium transition-opacity ${
          dirty ? "text-ocean opacity-100" : "opacity-0"
        }`}
      >
        {saving ? "Saving…" : "Press Enter to save"}
      </p>
    </div>
  );
}

// Previous / Save-and-Next wizard controls that sit above every editable
// step. On the last step, "Next" becomes the primary Launch button so users
// don't have to hunt for it in the header.
function WizardNav({
  currentStep,
  onGoTo,
  onSaveAndNext,
  onLaunch,
  canLaunch,
  launching,
  launchLabel,
}: {
  currentStep: (typeof WIZARD_STEPS)[number];
  onGoTo: (step: TabKey) => void;
  onSaveAndNext: (nextStep: TabKey) => void | Promise<void>;
  onLaunch: () => void;
  canLaunch: boolean;
  launching: boolean;
  launchLabel: string;
}) {
  const idx = WIZARD_STEPS.indexOf(currentStep);
  const prev = idx > 0 ? WIZARD_STEPS[idx - 1] : null;
  const next = idx < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[idx + 1] : null;
  const isLastStep = !next;

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => prev && onGoTo(prev)}
        disabled={!prev}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.06]"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <p className="text-xs font-medium text-slate-500 dark:text-white/50">
        Step {idx + 1} of {WIZARD_STEPS.length}
      </p>
      {isLastStep ? (
        canLaunch ? (
          <button
            type="button"
            onClick={onLaunch}
            disabled={launching}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {launchLabel}
          </button>
        ) : (
          <span className="text-xs font-medium text-slate-500 dark:text-white/50">Campaign is live</span>
        )
      ) : (
        <button
          type="button"
          onClick={() => next && onSaveAndNext(next)}
          disabled={launching}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60"
        >
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save and Next
          <ChevronLeft className="h-4 w-4 rotate-180" />
        </button>
      )}
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function AnalyticsTab({
  campaign,
  targetContacts,
}: {
  campaign: Campaign;
  targetContacts: CampaignDetailData["targetContacts"];
}) {
  const enrolled = campaign.contacts.length;
  const total = enrolled + Math.max(0, targetContacts.length - enrolled);
  const events = campaign._count.emailEvents;
  const triggers = campaign._count.etaTriggers;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Recipients" value={total.toLocaleString()} />
        <StatCard label="Sequence steps" value={campaign.sequences.length.toString()} />
        <StatCard label="Email events" value={events.toLocaleString()} />
        <StatCard label="ETA triggers" value={triggers.toLocaleString()} />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70">
        <p>
          Full analytics dashboard lives on the analytics sub-page — opens,
          clicks, replies, bounces per step over time.
        </p>
        <Link
          href={`/dashboard/campaigns/${campaign.id}/analytics`}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ocean hover:underline"
        >
          Open analytics dashboard →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

// ─── Leads ────────────────────────────────────────────────────────────────────

type ListContactPreview = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyName: string | null;
  title: string | null;
  country: string | null;
  marineRole: string | null;
  source?: string | null;
  verified?: boolean;
};

// Apollo previews land in the DB with a placeholder @unknown.local email until
// the user pays a credit to reveal the real address. Enrolling those into a
// campaign would bounce, so we flag them here and let the user reveal them
// explicitly from People Finder.
function isLockedContact(contact: {
  email: string;
  source?: string | null;
  verified?: boolean;
}) {
  if (contact.email.endsWith("@unknown.local")) return true;
  return contact.source === "APOLLO" && contact.verified === false;
}

type ListPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; rows: ListContactPreview[] };

/**
 * ETA campaigns send per-vessel: when a vessel gets an ETA, only the contacts
 * associated with THAT vessel receive the sequence (with that vessel's port
 * and date filled in). This panel makes the matching visible before launch so
 * the user can spot contacts that won't fire and vessels with nobody to mail.
 */
function VesselContactMatchPanel({
  targetVessels,
  targetContacts,
  vesselsByContact,
}: {
  targetVessels: CampaignDetailData["targetVessels"];
  targetContacts: CampaignDetailData["targetContacts"];
  vesselsByContact: Map<string, MatchedVessel[]>;
}) {
  const contactsById = useMemo(
    () => new Map(targetContacts.map((contact) => [contact.id, contact])),
    [targetContacts],
  );
  const unmatchedContacts = targetContacts.filter((contact) => !vesselsByContact.has(contact.id));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-slate-950 dark:text-white">
        Vessel ↔ contact matching
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
        When a vessel below gets an ETA, its sequence goes only to the contacts matched to that vessel — each send filled with that vessel&rsquo;s port and date. A contact matched to several vessels gets a send per vessel.
      </p>

      <div className="mt-4 space-y-2">
        {targetVessels.map((vessel) => {
          const matched = vessel.matchedContactIds
            .map((id) => contactsById.get(id))
            .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
          return (
            <div
              key={vessel.id}
              className={`rounded-md border p-3 ${
                matched.length > 0
                  ? "border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02]"
                  : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Ship className="h-4 w-4 text-ocean" />
                <span className="text-sm font-semibold text-slate-950 dark:text-white">
                  {vessel.vesselName || vessel.imoNumber}
                </span>
                <span className="text-xs text-slate-500 dark:text-white/50">IMO {vessel.imoNumber}</span>
                {formatEtaShort(vessel.nextEta) ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40"
                    title={`Next ETA${vessel.nextEtaPort ? ` — ${vessel.nextEtaPort}` : ""} (UTC)`}
                  >
                    <Clock className="h-3 w-3" />
                    ETA {formatEtaShort(vessel.nextEta)}
                    {vessel.nextEtaPort ? ` · ${vessel.nextEtaPort}` : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                    No upcoming ETA
                  </span>
                )}
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    matched.length > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                  }`}
                >
                  {matched.length > 0
                    ? `${matched.length} contact${matched.length === 1 ? "" : "s"} will receive this vessel's sends`
                    : "No matched contacts — this vessel's ETAs send nothing"}
                </span>
              </div>
              {matched.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {matched.map((contact) => (
                    <span
                      key={contact.id}
                      title={contact.email}
                      className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10"
                    >
                      {`${contact.firstName} ${contact.lastName}`.trim() || contact.email}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {unmatchedContacts.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">
            {unmatchedContacts.length} contact{unmatchedContacts.length === 1 ? "" : "s"} in the target list match no vessel — ETA triggers will skip them:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unmatchedContacts.slice(0, 12).map((contact) => (
              <span key={contact.id} title={contact.email} className="rounded-full bg-white px-2 py-0.5 font-medium ring-1 ring-amber-200 dark:bg-white/[0.06] dark:ring-amber-500/30">
                {`${contact.firstName} ${contact.lastName}`.trim() || contact.email}
              </span>
            ))}
            {unmatchedContacts.length > 12 ? <span>+ {unmatchedContacts.length - 12} more</span> : null}
          </div>
          <p className="mt-1.5">
            Matching uses the contact&rsquo;s email domain, website, or company name against the vessel&rsquo;s owner / manager companies. Fix the contact&rsquo;s company details or add their vessel to the list.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function LeadsTab({
  campaign,
  lists,
  targetContacts,
  targetVessels,
  stagedGroups,
  contactListId,
  onContactListId,
}: {
  campaign: Campaign;
  lists: ContactListModel[];
  targetLists: CampaignDetailData["targetLists"];
  targetContacts: CampaignDetailData["targetContacts"];
  targetVessels: CampaignDetailData["targetVessels"];
  stagedGroups: CampaignDetailData["stagedGroups"];
  contactListId: string;
  onContactListId: (value: string) => void;
}) {
  const enrolled = campaign.contacts.length;
  const [preview, setPreview] = useState<ListPreviewState>({ status: "idle" });
  const [apolloGroup, setApolloGroup] = useState<CampaignDetailData["stagedGroups"][number] | null>(
    null,
  );
  const isEta = campaign.triggerType !== "MANUAL";

  // Only show lists that match the campaign's trigger:
  //   ETA campaign  -> ETA-kind lists (contacts + vessels)
  //   Cold campaign -> Contact-kind lists (contacts only)
  // Legacy lists (no filterConfig.kind) are inferred by whether they hold
  // any vessels — matches the same rule the Lists page uses. Prevents the
  // user from ever accidentally picking a Contact list for an ETA campaign,
  // where the campaign would never fire (no vessels ⇒ no ETA trigger).
  const eligibleLists = lists.filter((list) => {
    const config = list.filterConfig as { kind?: string } | null | undefined;
    const explicit = config?.kind;
    const kind: "ETA" | "CONTACT" =
      explicit === "ETA" || explicit === "CONTACT"
        ? explicit
        : (list as { vesselCount?: number }).vesselCount && (list as { vesselCount?: number }).vesselCount! > 0
          ? "ETA"
          : "CONTACT";
    return isEta ? kind === "ETA" : kind === "CONTACT";
  });

  // Invert vessel → matchedContactIds into contact → vessels, so each row can
  // show which ships it's associated with (one contact can match several) and
  // when that ship's ETA fires the campaign.
  const vesselsByContact = useMemo(() => {
    const map = new Map<string, MatchedVessel[]>();
    for (const vessel of targetVessels) {
      for (const contactId of vessel.matchedContactIds) {
        const entry = map.get(contactId) ?? [];
        entry.push({
          id: vessel.id,
          vesselName: vessel.vesselName,
          imoNumber: vessel.imoNumber,
          nextEta: vessel.nextEta,
          nextEtaPort: vessel.nextEtaPort,
        });
        map.set(contactId, entry);
      }
    }
    return map;
  }, [targetVessels]);

  useEffect(() => {
    if (!contactListId) {
      setPreview({ status: "idle" });
      return;
    }
    let cancelled = false;
    setPreview({ status: "loading" });
    (async () => {
      try {
        const res = await apiFetch(`/api/lists/${contactListId}`);
        if (!res.ok) {
          if (!cancelled) setPreview({ status: "error", message: `Failed (${res.status})` });
          return;
        }
        const payload = (await res.json()) as { data?: { contacts?: ListContactPreview[] } };
        const rows = payload.data?.contacts ?? [];
        if (!cancelled) setPreview({ status: "loaded", rows });
      } catch (err) {
        if (!cancelled) {
          setPreview({
            status: "error",
            message: err instanceof Error ? err.message : "Network error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactListId]);

  const previewCount = preview.status === "loaded" ? preview.rows.length : 0;
  const selectedListName = contactListId
    ? lists.find((entry) => entry.id === contactListId)?.name ?? "Selected list"
    : null;

  // Build per-contact per-step event map from the recent EmailEvent slice.
  // Falls back to CampaignContact.currentStep for scheduled/pending state.
  const stepMap = useMemo(() => {
    const map = new Map<string, Map<number, Set<string>>>();
    for (const evt of campaign.emailEvents ?? []) {
      const contactId = evt.contactId;
      const stepOrder = evt.sequence?.stepOrder;
      if (!contactId || !stepOrder) continue;
      if (!map.has(contactId)) map.set(contactId, new Map());
      const byStep = map.get(contactId)!;
      if (!byStep.has(stepOrder)) byStep.set(stepOrder, new Set());
      byStep.get(stepOrder)!.add(evt.eventType);
    }
    return map;
  }, [campaign.emailEvents]);

  const totalSteps = campaign.sequences.length;

  const recipientRows = useMemo(() => {
    return campaign.contacts.map((row) => {
      const stepsForContact = stepMap.get(row.contactId) ?? new Map<number, Set<string>>();
      const has = (type: string) =>
        Array.from(stepsForContact.values()).some((events) => events.has(type));
      const sentCount = Array.from(stepsForContact.values()).filter((events) =>
        events.has("SENT") || events.has("DELIVERED") || events.has("OPENED") || events.has("REPLIED"),
      ).length;
      const status = deriveLeadStatus({ row, has, totalSteps, sentCount });
      return {
        row,
        stepsForContact,
        status,
      };
    });
  }, [campaign.contacts, stepMap, totalSteps]);

  // Search/filter UI was removed from the toolbar — users add and manage
  // leads through the list picker instead, so all rows render as-is here.
  const filtered = recipientRows;

  const kpis = useMemo(() => {
    let contacted = 0;
    let opened = 0;
    let replied = 0;
    let completed = 0;
    for (const { status } of recipientRows) {
      if (status.contacted) contacted += 1;
      if (status.opened) opened += 1;
      if (status.replied) replied += 1;
      if (status.completed) completed += 1;
    }
    return { total: recipientRows.length, contacted, opened, replied, completed };
  }, [recipientRows]);

  return (
    <div className="space-y-4">
      {/* List picker is always visible now — leads are added by choosing an
          ETA/contact list. No separate search / Add New buttons. */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">Add From Lead List</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
                Select the lead list you would like to add. Once this campaign is live, vessels or
                contacts added to the list are staged for your review before anyone is emailed.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-white/60">
              Lead list
              <select
                value={contactListId}
                onChange={(event) => onContactListId(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white md:max-w-md"
              >
                <option value="">Select</option>
                {eligibleLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.contactCount})
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-white/70">
              {selectedListName ? (
                <>
                  Currently targeting: <strong>{selectedListName}</strong> ·{" "}
                  <strong>{previewCount}</strong> contact{previewCount === 1 ? "" : "s"} will be enrolled on launch ·{" "}
                  <strong>{enrolled}</strong> already enrolled.
                </>
              ) : (
                "Currently targeting: no list selected."
              )}
            </div>
          </div>
          {contactListId ? (
            <div className="mt-4">
              <ListPreviewPanel
                state={preview}
                listName={selectedListName ?? ""}
                showShipEta={isEta}
                vesselsByContact={vesselsByContact}
              />
            </div>
          ) : null}
        </div>

      {/* Candidates added to the list after launch — held until confirmed. */}
      {stagedGroups.length > 0 && contactListId ? (
        <StagedReviewPanel
          campaignId={campaign.id}
          groups={stagedGroups}
          onFindPeople={setApolloGroup}
        />
      ) : null}

      {apolloGroup && contactListId ? (
        <ApolloVesselSearchModal
          group={apolloGroup}
          contactListId={contactListId}
          listName={selectedListName ?? "the target list"}
          onClose={() => setApolloGroup(null)}
        />
      ) : null}

      {/* Vessel ↔ contact matching (ETA campaigns) */}
      {isEta && targetVessels.length > 0 ? (
        <VesselContactMatchPanel
          targetVessels={targetVessels}
          targetContacts={targetContacts}
          vesselsByContact={vesselsByContact}
        />
      ) : null}

      {/* KPI strip */}
      {enrolled > 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <KpiChip icon={<Users className="h-4 w-4" />} label="Total Leads" value={kpis.total} tone="slate" />
          <KpiChip icon={<Send className="h-4 w-4" />} label="Leads Contacted" value={kpis.contacted} tone="purple" />
          <KpiChip icon={<MailOpen className="h-4 w-4" />} label="Leads Opened" value={kpis.opened} tone="amber" />
          <KpiChip icon={<Reply className="h-4 w-4" />} label="Leads Replied" value={kpis.replied} tone="pink" />
          <KpiChip icon={<ShieldCheck className="h-4 w-4" />} label="Completed Leads" value={kpis.completed} tone="emerald" />
        </div>
      ) : null}

      {/* Recipients table */}
      {enrolled > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/[0.04] dark:text-white/60">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-ocean" />
                  </th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Lead Status</th>
                  <th className="px-4 py-3">Name</th>
                  {isEta ? <th className="px-4 py-3">Ship / ETA</th> : null}
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isEta ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-white/60">
                      No leads match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ row, stepsForContact, status }) => {
                    const name = `${row.contact.firstName} ${row.contact.lastName}`.trim() || "-";
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 align-top">
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-ocean" />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-2 text-sm text-slate-900 dark:text-white">
                            <Mail className="h-4 w-4 text-slate-400" />
                            <span className="truncate max-w-[240px]" title={row.contact.email}>
                              {row.contact.email}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/60">
                            {Array.from({ length: totalSteps }, (_, idx) => idx + 1).map((step) => (
                              <StepChip
                                key={step}
                                step={step}
                                events={stepsForContact.get(step)}
                                isCurrent={row.currentStep === step - 1 || row.currentStep === step}
                                isScheduled={
                                  row.nextSendAt !== null &&
                                  row.sequence?.stepOrder === step &&
                                  !stepsForContact.get(step)?.has("SENT")
                                }
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            <StatusPill tone="neutral" label="Lead" />
                            {status.completed ? (
                              <StatusPill tone="emerald" label="Completed" />
                            ) : null}
                            {status.replied ? (
                              <StatusPill tone="pink" label="Replied" />
                            ) : status.opened ? (
                              <StatusPill tone="amber" label="Opened" />
                            ) : status.contacted ? (
                              <StatusPill tone="emerald-soft" label="Contacted" />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700 dark:text-white/80">
                          {name || "—"}
                        </td>
                        {isEta ? (
                          <td className="px-4 py-3 align-top">
                            <ShipEtaCell vessels={vesselsByContact.get(row.contactId) ?? []} />
                          </td>
                        ) : null}
                        <td className="px-4 py-3 align-top text-right">
                          <button
                            type="button"
                            className="rounded-md border border-slate-200 p-1 text-slate-400 hover:border-ocean hover:text-ocean dark:border-white/10"
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {campaign.contacts.length >= 500 ? (
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-white/[0.06] dark:text-white/50">
              Showing the first 500 recipients. Deep pagination arrives in Stage 2.
            </p>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

function KpiChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "slate" | "purple" | "amber" | "pink" | "emerald";
}) {
  const badgeTone: Record<typeof tone, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-white/80",
    purple: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    pink: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-white/70">
        <span className="text-slate-400 dark:text-white/50">{icon}</span>
        {label}
      </span>
      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badgeTone[tone]}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function StepChip({
  step,
  events,
  isCurrent,
  isScheduled,
}: {
  step: number;
  events: Set<string> | undefined;
  isCurrent: boolean;
  isScheduled: boolean;
}) {
  const hasReplied = events?.has("REPLIED");
  const hasOpened = events?.has("OPENED");
  const hasSent = events?.has("SENT") || events?.has("DELIVERED");
  const icon = hasReplied ? (
    <Reply className="h-3 w-3" />
  ) : hasOpened ? (
    <MailOpen className="h-3 w-3" />
  ) : hasSent ? (
    <Send className="h-3 w-3" />
  ) : isScheduled ? (
    <Clock className="h-3 w-3" />
  ) : (
    <Send className="h-3 w-3 opacity-40" />
  );
  const tone = hasReplied
    ? "text-pink-600 dark:text-pink-300"
    : hasOpened
      ? "text-amber-600 dark:text-amber-300"
      : hasSent
        ? "text-emerald-600 dark:text-emerald-300"
        : isScheduled
          ? "text-slate-500 dark:text-white/60"
          : "text-slate-400 dark:text-white/30";
  return (
    <span
      className={`inline-flex items-center gap-1 ${isCurrent ? "font-semibold" : ""}`}
      title={
        hasReplied
          ? `Step ${step} — replied`
          : hasOpened
            ? `Step ${step} — opened`
            : hasSent
              ? `Step ${step} — sent`
              : isScheduled
                ? `Step ${step} — scheduled`
                : `Step ${step} — pending`
      }
    >
      Step {step} <span className={tone}>{icon}</span>
      {step < 99 ? <span className="text-slate-300 dark:text-white/20">|</span> : null}
    </span>
  );
}

function StatusPill({ tone, label }: { tone: "neutral" | "emerald" | "emerald-soft" | "amber" | "pink"; label: string }) {
  const classes: Record<typeof tone, string> = {
    neutral: "border border-slate-200 text-slate-600 dark:border-white/15 dark:text-white/70",
    emerald: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    "emerald-soft": "border border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-200",
    amber: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    pink: "border border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-200",
  };
  const icon = tone === "emerald" || tone === "emerald-soft" ? (
    <Check className="h-3 w-3" />
  ) : tone === "amber" ? (
    <MailOpen className="h-3 w-3" />
  ) : tone === "pink" ? (
    <Reply className="h-3 w-3" />
  ) : null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${classes[tone]}`}>
      {icon}
      {label}
    </span>
  );
}

function deriveLeadStatus({
  row,
  has,
  totalSteps,
  sentCount,
}: {
  row: Campaign["contacts"][number];
  has: (type: string) => boolean;
  totalSteps: number;
  sentCount: number;
}) {
  const replied = has("REPLIED");
  const opened = has("OPENED");
  const contacted = has("SENT") || has("DELIVERED") || replied || opened;
  const terminal = row.status === "REPLIED" || row.status === "UNSUBSCRIBED";
  const completed = terminal || (totalSteps > 0 && sentCount >= totalSteps);
  return { contacted, opened, replied, completed };
}

function ListPreviewPanel({
  state,
  listName,
  showShipEta = false,
  vesselsByContact,
}: {
  state: ListPreviewState;
  listName: string;
  showShipEta?: boolean;
  vesselsByContact?: Map<string, MatchedVessel[]>;
}) {
  const lockedCount =
    state.status === "loaded" ? state.rows.filter(isLockedContact).length : 0;
  const eligibleCount =
    state.status === "loaded" ? state.rows.length - lockedCount : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
            Contacts in {listName || "the selected list"}
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Every unlocked contact below is included as a recipient. Save then launch to enroll them.
          </p>
        </div>
        {state.status === "loaded" ? (
          <span className="rounded-full bg-ocean/10 px-2.5 py-1 text-xs font-semibold text-ocean">
            {eligibleCount} eligible{lockedCount > 0 ? ` · ${lockedCount} locked` : ""}
          </span>
        ) : null}
      </div>
      {lockedCount > 0 ? (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{lockedCount}</strong> locked contact{lockedCount === 1 ? "" : "s"} in this list {lockedCount === 1 ? "hasn't" : "haven't"} been revealed yet. They&rsquo;re skipped when the campaign launches — no credits are spent automatically. Reveal them from{" "}
            <Link href="/dashboard/contacts" className="font-semibold underline">
              People Finder
            </Link>{" "}
            (1 credit per email) to include them.
          </span>
        </div>
      ) : null}
      {state.status === "loading" ? (
        <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading contacts…
        </div>
      ) : null}
      {state.status === "error" ? (
        <p className="px-5 py-6 text-sm text-red-700">Couldn&apos;t load contacts: {state.message}</p>
      ) : null}
      {state.status === "loaded" && state.rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500 dark:text-white/60">
          This list is empty. Add contacts to it from People Finder, then come back here.
        </p>
      ) : null}
      {state.status === "loaded" && state.rows.length > 0 ? (
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/[0.04] dark:text-white/60">
              <tr>
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    disabled
                    className="h-4 w-4 rounded border-slate-300 text-ocean"
                    title="All list members are included; edit the list to change membership"
                  />
                </th>
                {["Name", "Email", "Company", "Title", "Country"].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-2">
                    {label}
                  </th>
                ))}
                {showShipEta ? (
                  <th className="whitespace-nowrap px-4 py-2">Ship / ETA</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {state.rows.map((row) => {
                const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email;
                const locked = isLockedContact(row);
                const rowTone = locked ? "opacity-60" : "";
                return (
                  <tr key={row.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.02] ${rowTone}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!locked}
                        readOnly
                        disabled
                        title={locked ? "Skipped — reveal in People Finder to include" : undefined}
                        className="h-4 w-4 rounded border-slate-300 text-ocean"
                      />
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2 font-medium text-slate-950 dark:text-white" title={name}>
                      <Link href={`/dashboard/contacts/${row.id}`} className="hover:text-ocean">
                        {name}
                      </Link>
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2 text-slate-600 dark:text-white/70" title={row.email}>
                      {locked ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-200">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Locked · reveal to include
                        </span>
                      ) : (
                        row.email
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-slate-600 dark:text-white/70" title={row.companyName ?? undefined}>
                      {row.companyName ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-slate-600 dark:text-white/70" title={row.title ?? undefined}>
                      {row.title ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-white/70">
                      {row.country ?? "—"}
                    </td>
                    {showShipEta ? (
                      <td className="px-4 py-2">
                        <ShipEtaCell vessels={vesselsByContact?.get(row.id) ?? []} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ─── Sequences ────────────────────────────────────────────────────────────────

function SequencesTab({
  sequences,
  onSequences,
  triggerType,
}: {
  sequences: SequenceForm[];
  onSequences: (next: SequenceForm[]) => void;
  triggerType: Campaign["triggerType"];
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  // Clamp selection when steps are removed so we never index out of range.
  const safeIdx = Math.min(selectedIdx, sequences.length - 1);
  const active = sequences[safeIdx];

  function update(idx: number, patch: Partial<SequenceForm>) {
    onSequences(sequences.map((seq, i) => (i === idx ? { ...seq, ...patch } : seq)));
  }
  function addStep() {
    // Delay defaults follow the campaign's trigger — Manual counts days
    // after the previous send; ETA counts days before the vessel ETA.
    const isEta = triggerType === "ETA_BASED";
    onSequences([
      ...sequences,
      {
        id: generateId(),
        stepOrder: sequences.length + 1,
        subject: "",
        bodyHtml: "",
        delayType: isEta ? "DAYS_BEFORE_ETA" : "FIXED_DAYS",
        delayValue: isEta ? 0 : 3,
        conditionType: "IF_NOT_REPLIED",
      },
    ]);
    setSelectedIdx(sequences.length);
  }
  function removeStep(idx: number) {
    if (sequences.length <= 1) return;
    onSequences(sequences.filter((_, i) => i !== idx));
    if (idx <= safeIdx) setSelectedIdx(Math.max(0, safeIdx - 1));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-slate-700 dark:text-white/70">Campaign type:</span>
          <span className="inline-flex items-center rounded-full bg-ocean/10 px-3 py-1 text-xs font-semibold text-ocean">
            {triggerType === "MANUAL" ? "Cold campaign" : "ETA-based campaign"}
          </span>
          <span className="text-xs text-slate-500 dark:text-white/50">
            {triggerType === "MANUAL"
              ? "Every step waits N days after the previous send, starting from launch. Uses the Schedule tab's window."
              : "Every step fires N days before the vessel's ETA. Vessels come from the target list."}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        {/* Left rail: step cards with inline delay controls */}
        <div className="space-y-3">
          {sequences.map((seq, idx) => (
            <StepCard
              key={seq.id}
              index={idx}
              seq={seq}
              triggerType={triggerType}
              selected={idx === safeIdx}
              canDelete={sequences.length > 1}
              onSelect={() => setSelectedIdx(idx)}
              onDelete={() => removeStep(idx)}
              onChange={(patch) => update(idx, patch)}
            />
          ))}

          <button
            type="button"
            onClick={addStep}
            className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-600 hover:border-ocean hover:text-ocean dark:border-white/15 dark:text-white/70"
          >
            <Plus className="mr-1 inline h-4 w-4" />
            Add Step
          </button>
        </div>

        {/* Right pane: editor for selected step */}
        {active ? (
          <StepEditor
            key={active.id}
            seq={active}
            onChange={(patch) => update(safeIdx, patch)}
          />
        ) : null}
      </div>
    </div>
  );
}

function StepCard({
  index,
  seq,
  triggerType,
  selected,
  canDelete,
  onSelect,
  onDelete,
  onChange,
}: {
  index: number;
  seq: SequenceForm;
  triggerType: Campaign["triggerType"];
  selected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onChange: (patch: Partial<SequenceForm>) => void;
}) {
  const preview = seq.subject.trim() || "New sequence";
  const isEta = triggerType === "ETA_BASED";
  // Step 1 on a Manual campaign fires at launch — no configurable wait.
  const showDelay = isEta || index > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`block w-full cursor-pointer rounded-lg border p-3 text-left transition ${
        selected
          ? "border-ocean bg-ocean/5 dark:bg-ocean/10"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
      }`}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-white/70">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-ocean" />
          Step {index + 1}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (canDelete) onDelete();
            }}
            disabled={!canDelete}
            title={canDelete ? "Remove step" : "Keep at least one step"}
            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            aria-label="Remove step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p
        className="mt-3 truncate text-sm text-slate-900 dark:text-white/90"
        title={preview}
      >
        {preview}
      </p>
      {showDelay ? (
        <div
          className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-white/10 dark:text-white/70"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="font-semibold">{isEta ? "Send" : "Wait"}</span>
          <input
            type="number"
            min={0}
            // Backend stores signed values (negative = after ETA). Users
            // never type a minus — the Before/After select below carries the
            // sign — so we clamp the input to a non-negative magnitude.
            value={Math.abs(seq.delayValue)}
            onChange={(event) => {
              const magnitude = Math.max(0, Number(event.target.value) || 0);
              const signed = isEta && seq.delayValue < 0 ? -magnitude : magnitude;
              onChange({ delayValue: signed });
            }}
            className="w-14 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-xs dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          />
          <span>days</span>
          {isEta ? (
            <>
              <select
                value={seq.delayValue < 0 ? "AFTER" : "BEFORE"}
                onChange={(event) => {
                  const magnitude = Math.abs(seq.delayValue);
                  onChange({ delayValue: event.target.value === "AFTER" ? -magnitude : magnitude });
                }}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              >
                <option value="BEFORE">Before</option>
                <option value="AFTER">After</option>
              </select>
              <span>ETA</span>
            </>
          ) : (
            <span>{index === 1 ? "after step 1" : "after previous step"}</span>
          )}
        </div>
      ) : null}
      {index > 0 ? (
        <div
          className="mt-2 flex items-center justify-center gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-white/10 dark:text-white/70"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="font-semibold">Send when:</span>
          <select
            value={seq.conditionType}
            onChange={(event) => onChange({ conditionType: event.target.value as SequenceForm["conditionType"] })}
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          >
            <option value="ALWAYS">Always</option>
            <option value="IF_NOT_OPENED">If not opened</option>
            <option value="IF_NOT_REPLIED">If not replied</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

function StepEditor({
  seq,
  onChange,
}: {
  seq: SequenceForm;
  onChange: (patch: Partial<SequenceForm>) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
          Subject:
        </span>
        <div className="flex-1">
          <MergeTagField
            as="input"
            value={seq.subject}
            onChange={(next) => onChange({ subject: next })}
            placeholder="Invitation to Join …   (type { to insert a merge tag)"
            className="w-full border-none bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
          />
        </div>
      </div>

      <MergeTagField
        as="textarea"
        value={seq.bodyHtml}
        onChange={(next) => onChange({ bodyHtml: next })}
        rows={18}
        placeholder="Good Day,&#10;Dear Sir,&#10;&#10;We are pleased to introduce …&#10;&#10;Tip: type { to insert a merge tag."
        className="min-h-[420px] w-full flex-1 resize-none border-none bg-white px-6 py-5 text-sm leading-relaxed text-slate-800 outline-none dark:bg-white/[0.02] dark:text-white/85"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-white/60">
        <span>
          Merge tags: {"{{first_name}}"}, {"{{company}}"}, {"{{vessel_name}}"}, {"{{eta_port}}"}, {"{{eta_date}}"}
          <span className="ml-2 text-slate-400 dark:text-white/40">— type <code className="rounded bg-slate-100 px-1 dark:bg-white/[0.06]">{`{`}</code> in the subject or body to pick from a menu.</span>
        </span>
      </div>
    </div>
  );
}

// ─── Schedule ────────────────────────────────────────────────────────────────

function ScheduleTab({
  scheduleDays,
  onScheduleDays,
  hourStart,
  onHourStart,
  hourEnd,
  onHourEnd,
  timezone,
  onTimezone,
}: {
  scheduleDays: number[];
  onScheduleDays: (next: number[]) => void;
  hourStart: number;
  onHourStart: (next: number) => void;
  hourEnd: number;
  onHourEnd: (next: number) => void;
  timezone: string;
  onTimezone: (next: string) => void;
}) {
  const timezones = useMemo(
    () => [
      { label: "UTC", value: "UTC" },
      { label: "Kolkata, India (UTC+5:30)", value: "Asia/Kolkata" },
      { label: "Dubai, UAE (UTC+4:00)", value: "Asia/Dubai" },
      { label: "Kuala Lumpur, Singapore (UTC+8:00)", value: "Asia/Singapore" },
      { label: "London (UTC+0:00)", value: "Europe/London" },
      { label: "Athens (UTC+2:00)", value: "Europe/Athens" },
      { label: "Eastern Time (UTC-4:00)", value: "America/New_York" },
      { label: "Pacific Time (UTC-7:00)", value: "America/Los_Angeles" },
      { label: "Auckland (UTC+13:00)", value: "Pacific/Auckland" },
    ],
    [],
  );

  function toggleDay(day: number) {
    onScheduleDays(
      scheduleDays.includes(day)
        ? scheduleDays.filter((entry) => entry !== day)
        : [...scheduleDays, day].sort(),
    );
  }

  function fmtHour(hour: number) {
    const period = hour >= 12 ? "PM" : "AM";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(twelve).padStart(2, "0")}:00 ${period}`;
  }

  const DAY_FULL = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ] as const;

  return (
    // Start/End dates, per-schedule name, and the "Add Schedule" pill were
    // all Stage-2 placeholders backed by no persisted state — users kept
    // trying to change them and finding nothing worked. Removed until we
    // have multi-schedule support in the data model.
    <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Timings</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-white/60">
              Start
              <select
                value={hourStart}
                onChange={(event) => onHourStart(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {fmtHour(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-white/60">
              End
              <select
                value={hourEnd}
                onChange={(event) => onHourEnd(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {fmtHour(h % 24)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-white/60">
              Timezone
              <select
                value={timezone}
                onChange={(event) => onTimezone(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              >
                {timezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Days</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {DAY_FULL.map((label, day) => (
              <label
                key={label}
                className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-white/80"
              >
                <input
                  type="checkbox"
                  checked={scheduleDays.includes(day)}
                  onChange={() => toggleDay(day)}
                  className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
    </div>
  );
}

// ─── Options ────────────────────────────────────────────────────────────────

function OptionsTab({
  dailyLimit,
  onDailyLimit,
  sendGapSeconds,
  onSendGapSeconds,
  sendGapMaxSeconds,
  onSendGapMaxSeconds,
  trackOpens,
  onTrackOpens,
  trackClicks,
  onTrackClicks,
  stopOnBounce,
  onStopOnBounce,
  stopOnUnsubscribe,
  onStopOnUnsubscribe,
  rotationStrategy,
  onRotationStrategy,
  fromAccountIds,
  onFromAccountIds,
  inboxSelectionLocked,
}: {
  dailyLimit: number;
  onDailyLimit: (next: number) => void;
  sendGapSeconds: number;
  onSendGapSeconds: (next: number) => void;
  sendGapMaxSeconds: number;
  onSendGapMaxSeconds: (next: number) => void;
  trackOpens: boolean;
  onTrackOpens: (next: boolean) => void;
  trackClicks: boolean;
  onTrackClicks: (next: boolean) => void;
  stopOnBounce: boolean;
  onStopOnBounce: (next: boolean) => void;
  stopOnUnsubscribe: boolean;
  onStopOnUnsubscribe: (next: boolean) => void;
  rotationStrategy: Campaign["rotationStrategy"];
  onRotationStrategy: (next: Campaign["rotationStrategy"]) => void;
  fromAccountIds: string[];
  onFromAccountIds: (next: string[]) => void;
  inboxSelectionLocked: boolean;
}) {
  // Present the gap in minutes for a human-friendly "5 to 20 min" mental model
  // while storing seconds. Rounded to whole minutes.
  const minGapMinutes = Math.round(sendGapSeconds / 60);
  const maxGapMinutes = Math.round(Math.max(sendGapMaxSeconds, sendGapSeconds) / 60);
  const isRandom = sendGapMaxSeconds > sendGapSeconds;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
          <Settings className="h-4 w-4" /> Sending
        </h3>
        <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-white/60">
          Daily send limit per inbox
          <input
            type="number"
            min={1}
            value={dailyLimit}
            onChange={(event) => onDailyLimit(Number(event.target.value) || 1)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          />
        </label>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-600 dark:text-white/60">
            Gap between emails (minutes)
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1">
              <input
                type="number"
                min={0}
                max={1440}
                value={minGapMinutes}
                aria-label="Minimum gap in minutes"
                onChange={(event) => {
                  const min = Math.max(0, Math.min(1440, Number(event.target.value) || 0));
                  onSendGapSeconds(min * 60);
                  // keep max >= min so the range stays valid
                  if (min * 60 > sendGapMaxSeconds) onSendGapMaxSeconds(min * 60);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              />
              <span className="mt-0.5 block text-center text-[10px] uppercase tracking-wide text-slate-400">Min</span>
            </div>
            <span className="pb-4 text-slate-400">–</span>
            <div className="flex-1">
              <input
                type="number"
                min={0}
                max={1440}
                value={maxGapMinutes}
                aria-label="Maximum gap in minutes"
                onChange={(event) => {
                  const max = Math.max(0, Math.min(1440, Number(event.target.value) || 0));
                  onSendGapMaxSeconds(Math.max(max * 60, sendGapSeconds));
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              />
              <span className="mt-0.5 block text-center text-[10px] uppercase tracking-wide text-slate-400">Max</span>
            </div>
          </div>
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-white/45">
            {sendGapSeconds === 0 && sendGapMaxSeconds === 0
              ? "No gap — send as fast as the schedule allows."
              : isRandom
                ? `Each email waits a random ${minGapMinutes}–${maxGapMinutes} min after the previous one — natural, human-like pacing.`
                : `Each email waits a fixed ${minGapMinutes} min after the previous one. Set a higher Max to randomise.`}
          </span>
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-600 dark:text-white/60">
            Send from
            {inboxSelectionLocked ? (
              <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-white/60">
                locked after launch
              </span>
            ) : null}
          </p>
          <InboxPicker
            value={fromAccountIds}
            onChange={onFromAccountIds}
            disabled={inboxSelectionLocked}
          />
        </div>
        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-white/60">
          Inbox rotation strategy
          <select
            value={rotationStrategy}
            onChange={(event) => onRotationStrategy(event.target.value as Campaign["rotationStrategy"])}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          >
            <option value="ROUND_ROBIN">Round robin</option>
            <option value="WEIGHTED">Weighted</option>
            <option value="LEAST_USED">Least used</option>
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Tracking</h3>
        <div className="mt-4 space-y-3">
          <Toggle label="Track opens" value={trackOpens} onChange={onTrackOpens} />
          <Toggle label="Track clicks" value={trackClicks} onChange={onTrackClicks} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] lg:col-span-2">
        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Auto-stop conditions</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Toggle label="Stop on bounce" value={stopOnBounce} onChange={onStopOnBounce} />
          <Toggle label="Stop on unsubscribe" value={stopOnUnsubscribe} onChange={onStopOnUnsubscribe} />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
      />
    </label>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusTone(status: string) {
  if (status === "ACTIVE") return "bg-emerald-100 text-emerald-700";
  if (status === "DRAFT") return "bg-slate-100 text-slate-700";
  if (status === "PAUSED") return "bg-amber-100 text-amber-700";
  if (status === "COMPLETED") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

