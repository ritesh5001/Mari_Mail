"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/** Seed describing who the campaign targets, passed by the entry point. */
export type CampaignSeed =
  | { kind: "list"; listId: string; label: string; count?: number }
  | { kind: "list-role"; listId: string; marineRoles: string[]; label: string; count?: number }
  | { kind: "contacts"; contactIds: string[]; label: string };

type ListOption = { id: string; name: string; contactCount: number };

type SequenceStep = {
  subject: string;
  bodyHtml: string;
  delayValue: number; // days to wait before this step (step 1 = 0 = at launch)
  conditionType: "ALWAYS" | "IF_NOT_OPENED" | "IF_NOT_REPLIED";
};

const MERGE_TAGS = [
  "first_name",
  "company",
  "title",
  "vessel_name",
  "eta_port",
  "eta_date",
  "ship_owner",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEPS = ["Recipients", "Sequence", "Schedule", "Review & launch"];

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-ocean dark:border-white/15 dark:bg-white/[0.04] dark:text-white/85";

export function SequenceCampaignWizard({
  seed,
  onClose,
}: {
  seed: CampaignSeed;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [lists, setLists] = useState<ListOption[]>([]);
  // Recipients: when seeded with a list or list-role, listId is set;
  // with contacts, contactIds is set.
  const [listId, setListId] = useState(
    seed.kind === "list" || seed.kind === "list-role" ? seed.listId : "",
  );
  const contactIds = seed.kind === "contacts" ? seed.contactIds : [];
  const marineRoles = seed.kind === "list-role" ? seed.marineRoles : [];

  const [sequences, setSequences] = useState<SequenceStep[]>([
    { subject: "", bodyHtml: "", delayValue: 0, conditionType: "ALWAYS" },
  ]);

  const [sendMode, setSendMode] = useState<"FIXED" | "ETA">("FIXED");
  const [dailyLimit, setDailyLimit] = useState(500);
  const [timezone, setTimezone] = useState("UTC");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hourStart, setHourStart] = useState(9);
  const [hourEnd, setHourEnd] = useState(17);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    scheduled: number;
    contacts: number;
  } | null>(null);

  useEffect(() => {
    apiFetch(`/api/lists?scope=my`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { data?: { lists?: ListOption[] } } | null) =>
        setLists(p?.data?.lists ?? []),
      )
      .catch(() => {});
  }, []);

  const recipientCount = useMemo(() => {
    if (seed.kind === "contacts") return contactIds.length;
    if (seed.kind === "list-role") return seed.count ?? 0;
    const fromList = lists.find((l) => l.id === listId)?.contactCount;
    return fromList ?? seed.count ?? 0;
  }, [seed, contactIds.length, lists, listId]);

  function updateSequence(i: number, patch: Partial<SequenceStep>) {
    setSequences((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }
  function addSequence() {
    setSequences((prev) => [
      ...prev,
      {
        subject: "",
        bodyHtml: "",
        delayValue: 3,
        conditionType: "IF_NOT_REPLIED",
      },
    ]);
  }
  function removeSequence(i: number) {
    setSequences((prev) => prev.filter((_, idx) => idx !== i));
  }
  function insertTag(i: number, tag: string) {
    updateSequence(i, { bodyHtml: `${sequences[i].bodyHtml}{{${tag}}}` });
  }
  function toggleDay(day: number) {
    setScheduleDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort(),
    );
  }
  const canNext = useMemo(() => {
    if (step === 0)
      return (
        Boolean(name.trim()) &&
        recipientCount > 0 &&
        (seed.kind === "contacts" || Boolean(listId))
      );
    if (step === 1)
      return sequences.every((s) => s.subject.trim() && s.bodyHtml.trim());
    return true;
  }, [
    step,
    name,
    recipientCount,
    seed.kind,
    listId,
    sequences,
  ]);

  async function launch() {
    setSubmitting(true);
    setError(null);
    try {
      const targetConfig =
        seed.kind === "contacts"
          ? { roles: [], marineRoles: [], contactListIds: [], contactIds }
          : {
              // Company-role expansion (SHIP_OWNER etc.) only applies when a
              // marine-role filter isn't set — otherwise the marineRoles are
              // the real intent and mixing both would over-scope.
              roles: marineRoles.length ? [] : [],
              marineRoles,
              contactListIds: [listId],
              contactIds: [],
            };

      const createRes = await apiFetch(`/api/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          status: "DRAFT",
          triggerType: sendMode === "FIXED" ? "MANUAL" : "ETA_BASED",
          sendingMode: "BULK_CAMPAIGN",
          fromAccountIds: [],
          rotationStrategy: "ROUND_ROBIN",
          dailyLimit,
          timezone,
          scheduleDays,
          scheduleHourStart: hourStart,
          scheduleHourEnd: hourEnd,
          targetConfig,
          sequences: sequences.map((s, idx) => ({
            stepOrder: idx + 1,
            subject: s.subject,
            bodyHtml: s.bodyHtml,
            delayType: "FIXED_DAYS",
            delayValue: s.delayValue,
            conditionType: s.conditionType,
          })),
        }),
      });
      const createPayload = (await createRes.json()) as {
        data?: { campaign?: { id: string } };
        error?: { message?: string };
      };
      if (!createRes.ok || !createPayload.data?.campaign?.id) {
        throw new Error(
          createPayload.error?.message ?? "Failed to create campaign",
        );
      }
      const campaignId = createPayload.data.campaign.id;

      const launchPath = sendMode === "FIXED" ? "launch" : "activate";
      const launchRes = await apiFetch(
        `/api/campaigns/${campaignId}/${launchPath}`,
        {
          method: "POST",
        },
      );
      const launchPayload = (await launchRes.json()) as {
        data?: { scheduled?: number; contacts?: number };
        error?: { message?: string };
      };
      if (!launchRes.ok)
        throw new Error(
          launchPayload.error?.message ?? "Failed to launch campaign",
        );

      setDone({
        scheduled: launchPayload.data?.scheduled ?? 0,
        contacts: launchPayload.data?.contacts ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0B0B0E]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + stepper */}
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              New campaign
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    i === step
                      ? "bg-ocean text-white"
                      : i < step
                        ? "bg-ocean/20 text-ocean"
                        : "bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-white/40"
                  }`}
                >
                  {i + 1}
                </span>
                <span
                  className={`text-xs font-medium ${i === step ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-white/40"}`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="h-px w-4 bg-slate-200 dark:bg-white/10" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {done ? (
            <div className="py-8 text-center">
              <p className="text-lg font-semibold text-emerald-600">
                Campaign launched 🎉
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
                {done.contacts}{" "}
                {done.contacts === 1 ? "recipient" : "recipients"} enrolled ·{" "}
                {done.scheduled} emails scheduled.
              </p>
              {done.scheduled === 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  Nothing was scheduled — check that the queue (Redis) is
                  running and the recipients have valid emails.
                </p>
              )}
            </div>
          ) : (
            <>
              {step === 0 && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/70">
                      Campaign name
                    </span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Q3 Fujairah outreach"
                      className={inputCls}
                    />
                  </label>
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-sm font-medium text-slate-700 dark:text-white/70">
                      Recipients
                    </p>
                    {seed.kind === "contacts" ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
                        {seed.label} — {recipientCount} contacts
                      </p>
                    ) : seed.kind === "list-role" ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
                        {seed.label} · {seed.marineRoles.length === 1 ? "role" : "roles"}{" "}
                        {seed.marineRoles.map((role) => role.replace(/_/g, " ").toLowerCase()).join(", ")} — {recipientCount} contacts
                      </p>
                    ) : (
                      <select
                        value={listId}
                        onChange={(e) => setListId(e.target.value)}
                        className={`${inputCls} mt-2`}
                      >
                        <option value="">Select one of your lists…</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.contactCount})
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-2 text-xs text-slate-400 dark:text-white/40">
                      {recipientCount} recipients will be targeted.{seed.kind === "list-role" || seed.kind === "list" ? " Future additions to this list will auto-enroll." : ""}
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  {sequences.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white/80">
                          Email {i + 1}
                        </p>
                        {sequences.length > 1 && (
                          <button
                            onClick={() => removeSequence(i)}
                            className="text-slate-400 hover:text-red-500"
                            aria-label="Remove email"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 dark:text-white/40">
                        {i === 0
                          ? "Sends at launch"
                          : `Sends ${s.delayValue} day(s) after the previous email`}
                      </p>
                      {i > 0 && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-white/60">
                          Wait
                          <input
                            type="number"
                            min={0}
                            value={s.delayValue}
                            onChange={(e) =>
                              updateSequence(i, {
                                delayValue: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-16 rounded border border-slate-300 px-2 py-1 dark:border-white/15 dark:bg-white/[0.04]"
                          />
                          days, then send only if
                          <select
                            value={s.conditionType}
                            onChange={(e) =>
                              updateSequence(i, {
                                conditionType: e.target
                                  .value as SequenceStep["conditionType"],
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1 dark:border-white/15 dark:bg-white/[0.04]"
                          >
                            <option value="ALWAYS">always</option>
                            <option value="IF_NOT_REPLIED">not replied</option>
                            <option value="IF_NOT_OPENED">not opened</option>
                          </select>
                        </label>
                      )}
                      <input
                        value={s.subject}
                        onChange={(e) =>
                          updateSequence(i, { subject: e.target.value })
                        }
                        placeholder="Subject"
                        className={`${inputCls} mt-3`}
                      />
                      <textarea
                        value={s.bodyHtml}
                        onChange={(e) =>
                          updateSequence(i, { bodyHtml: e.target.value })
                        }
                        placeholder="Write your email… use the merge tags below to personalize."
                        rows={5}
                        className={`${inputCls} mt-2`}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {MERGE_TAGS.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => insertTag(i, tag)}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:border-ocean hover:text-ocean dark:border-white/15 dark:text-white/50"
                          >
                            {`{{${tag}}}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addSequence}
                    className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-ocean hover:text-ocean dark:border-white/15 dark:text-white/60"
                  >
                    <Plus className="h-4 w-4" />
                    Add follow-up email
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-sm font-medium text-slate-700 dark:text-white/70">
                      Sending model
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-white/70">
                        <input
                          type="radio"
                          checked={sendMode === "FIXED"}
                          onChange={() => setSendMode("FIXED")}
                          className="mt-1"
                        />
                        <span>
                          <b>Fixed schedule</b> — send now, follow up after N
                          days.
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-white/70">
                        <input
                          type="radio"
                          checked={sendMode === "ETA"}
                          onChange={() => setSendMode("ETA")}
                          className="mt-1"
                        />
                        <span>
                          <b>ETA-triggered</b> — fire relative to each
                          vessel&apos;s ETA (needs matching port/ETA rules).
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-sm font-medium text-slate-700 dark:text-white/70">
                      Sending window
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {DAY_LABELS.map((label, day) => (
                        <button
                          key={label}
                          onClick={() => toggleDay(day)}
                          className={`rounded px-2.5 py-1 text-xs font-medium ${
                            scheduleDays.includes(day)
                              ? "bg-ocean text-white"
                              : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-xs text-slate-500 dark:text-white/50">
                        Daily limit
                        <input
                          type="number"
                          min={1}
                          value={dailyLimit}
                          onChange={(e) =>
                            setDailyLimit(Math.max(1, Number(e.target.value)))
                          }
                          className={`${inputCls} mt-1`}
                        />
                      </label>
                      <label className="text-xs text-slate-500 dark:text-white/50">
                        From hour
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={hourStart}
                          onChange={(e) => setHourStart(Number(e.target.value))}
                          className={`${inputCls} mt-1`}
                        />
                      </label>
                      <label className="text-xs text-slate-500 dark:text-white/50">
                        To hour
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={hourEnd}
                          onChange={(e) => setHourEnd(Number(e.target.value))}
                          className={`${inputCls} mt-1`}
                        />
                      </label>
                      <label className="text-xs text-slate-500 dark:text-white/50">
                        Timezone
                        <input
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          className={`${inputCls} mt-1`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3 text-sm">
                  <Row label="Name" value={name} />
                  <Row
                    label="Recipients"
                    value={`${recipientCount} contacts`}
                  />
                  <Row
                    label="Emails in sequence"
                    value={String(sequences.length)}
                  />
                  <Row
                    label="Sending model"
                    value={
                      sendMode === "FIXED" ? "Fixed schedule" : "ETA-triggered"
                    }
                  />
                  <Row
                    label="Window"
                    value={`${scheduleDays.map((d) => DAY_LABELS[d]).join(", ")} · ${hourStart}:00–${hourEnd}:00 ${timezone}`}
                  />
                  {error && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 dark:border-white/10">
            <button
              onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-white/70"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext}
                className="rounded-md bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-ocean disabled:opacity-40 dark:bg-accent-600 dark:hover:bg-accent-500"
              >
                Next
              </button>
            ) : (
              <button
                onClick={launch}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-1.5 text-sm font-semibold text-white hover:bg-ocean/90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Launch campaign
              </button>
            )}
          </div>
        )}
        {done && (
          <div className="flex justify-end border-t border-slate-200 px-6 py-3 dark:border-white/10">
            <button
              onClick={onClose}
              className="rounded-md bg-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-2 dark:border-white/5">
      <span className="text-slate-500 dark:text-white/45">{label}</span>
      <span className="font-medium text-slate-900 dark:text-white/85">
        {value}
      </span>
    </div>
  );
}
