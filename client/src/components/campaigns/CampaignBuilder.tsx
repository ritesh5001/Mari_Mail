"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Clock,
  MailPlus,
  Radar,
  Send,
  Ship,
  Split,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import type { CampaignDashboardData } from "@/lib/campaign-data";

type SequenceDraft = {
  stepOrder: number;
  subject: string;
  bodyHtml: string;
  delayValue: number;
  conditionType: "ALWAYS" | "IF_NOT_OPENED" | "IF_NOT_REPLIED";
  abTestEnabled: boolean;
  abSubjectB: string;
  abBodyHtmlB: string;
  abSplit: number;
};

const defaultSequences: SequenceDraft[] = [
  {
    stepOrder: 1,
    subject:
      "Hold Cleaning Support Before {{eta_port}} Arrival - {{vessel_name}}",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>{{vessel_name}} is scheduled for {{eta_port}} on {{eta_date}}. Our team can support hold cleaning planning before arrival.</p>",
    delayValue: 5,
    conditionType: "ALWAYS",
    abTestEnabled: false,
    abSubjectB: "",
    abBodyHtmlB: "",
    abSplit: 50,
  },
  {
    stepOrder: 2,
    subject: "Following Up: {{vessel_name}} ETA {{eta_port}} in 3 Days",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>Following up on the upcoming {{eta_port}} call. We can coordinate cleaning support around terminal timing.</p>",
    delayValue: 3,
    conditionType: "IF_NOT_REPLIED",
    abTestEnabled: false,
    abSubjectB: "",
    abBodyHtmlB: "",
    abSplit: 50,
  },
  {
    stepOrder: 3,
    subject: "Final Reminder: {{vessel_name}} Arriving {{eta_port}} Tomorrow",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>{{vessel_name}} arrives tomorrow. If hold cleaning is still open, our team can align crew availability.</p>",
    delayValue: 1,
    conditionType: "IF_NOT_REPLIED",
    abTestEnabled: false,
    abSubjectB: "",
    abBodyHtmlB: "",
    abSplit: 50,
  },
];

const vesselTypes = [
  "BULK_CARRIER",
  "TANKER_CRUDE",
  "TANKER_PRODUCT",
  "TANKER_CHEMICAL",
  "CONTAINER",
  "GENERAL_CARGO",
];

export function CampaignBuilder({ data }: { data: CampaignDashboardData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [triggerType, setTriggerType] = useState("ETA_BASED");
  const [sequences, setSequences] = useState(defaultSequences);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const stats = {
    active: data.campaigns.filter((campaign) => campaign.status === "ACTIVE")
      .length,
    contacts: data.campaigns.reduce(
      (sum, campaign) =>
        sum + (campaign.counts.contacts || campaign.counts.targeted),
      0,
    ),
    events: data.campaigns.reduce(
      (sum, campaign) => sum + campaign.counts.events,
      0,
    ),
    triggers: data.campaigns.reduce(
      (sum, campaign) => sum + campaign.counts.triggers,
      0,
    ),
  };

  function updateSequence(index: number, patch: Partial<SequenceDraft>) {
    setSequences((current) =>
      current.map((sequence, itemIndex) =>
        itemIndex === index ? { ...sequence, ...patch } : sequence,
      ),
    );
  }

  function addSequence() {
    setSequences((current) => [
      ...current,
      {
        stepOrder: current.length + 1,
        subject: "Follow-up for {{vessel_name}}",
        bodyHtml:
          "<p>Hello {{first_name}},</p><p>Checking in on {{vessel_name}} and the {{eta_port}} call.</p>",
        delayValue: 0,
        conditionType: "IF_NOT_REPLIED",
        abTestEnabled: false,
        abSubjectB: "",
        abBodyHtmlB: "",
        abSplit: 50,
      },
    ]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);

    const body = {
      name: String(form.get("name")),
      description: String(form.get("description") || "") || undefined,
      status: form.get("activate") === "on" ? "ACTIVE" : "DRAFT",
      triggerType,
      sendingMode: "BULK_CAMPAIGN",
      fromName: String(form.get("fromName") || "") || undefined,
      fromAccountIds: [],
      rotationStrategy: "ROUND_ROBIN",
      dailyLimit: Number(form.get("dailyLimit") || 500),
      timezone: String(form.get("timezone") || "UTC"),
      scheduleDays: form.getAll("scheduleDays").map(Number),
      scheduleHourStart: Number(form.get("scheduleHourStart") || 9),
      scheduleHourEnd: Number(form.get("scheduleHourEnd") || 17),
      trackOpens: form.get("trackOpens") === "on",
      trackClicks: form.get("trackClicks") === "on",
      stopOnReply: form.get("stopOnReply") === "on",
      stopOnBounce: form.get("stopOnBounce") === "on",
      stopOnUnsubscribe: form.get("stopOnUnsubscribe") === "on",
      tags: String(form.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      targetConfig: {
        roles: form.getAll("roles").map(String),
        contactListIds: form.getAll("contactListIds").map(String),
        contactIds: [],
      },
      triggerConfig: {
        portCodes: form.getAll("portCodes").map(String),
        vesselTypes: form.getAll("vesselTypes").map(String),
        previousCargo: String(form.get("previousCargo") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        nextCargo: String(form.get("nextCargo") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        autoEnroll: true,
        priority: Number(form.get("priority") || 100),
      },
      sequences: sequences.map((sequence) => ({
        ...sequence,
        delayType: "DAYS_BEFORE_ETA",
        bodyText: "",
        abSubjectB: sequence.abSubjectB || undefined,
        abBodyHtmlB: sequence.abBodyHtmlB || undefined,
      })),
    };

    const response = await apiFetch(`/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      setMessage(payload.error?.message ?? "Campaign save failed.");
      return;
    }
    setMessage("Campaign saved.");
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-ocean/10 p-2 text-ocean">
              <Workflow className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ocean">
                Phase 6 ETA Sequencer
              </p>
              <h2 className="text-2xl font-semibold text-slate-950">
                Campaigns
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Build ETA-triggered sequences, schedule campaigns, and track
                engagement.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Summary label="Active" value={stats.active.toString()} />
            <Summary label="Contacts" value={stats.contacts.toString()} />
            <Summary label="Events" value={stats.events.toString()} />
            <Summary label="Triggers" value={stats.triggers.toString()} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">
              Campaign Creation Wizard
            </h3>
            <p className="text-sm text-slate-600">
              ETA campaigns use seven steps. Manual campaigns skip trigger
              configuration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md bg-ocean px-4 py-2 text-sm font-semibold text-white"
          >
            {open ? "Close" : "Create campaign"}
          </button>
        </div>

        {open ? (
          <form className="mt-5 space-y-5" onSubmit={submit}>
            <div className="flex gap-2 overflow-x-auto">
              {[1, 2, 3, 4, 5, 6, 7].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStep(item)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${step === item ? "bg-navy text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Step {item}
                </button>
              ))}
            </div>

            <div
              className={step === 1 ? "grid gap-4 md:grid-cols-2" : "hidden"}
            >
              <Field label="Campaign name">
                <input
                  name="name"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Campaign type">
                <select
                  value={triggerType}
                  onChange={(event) =>
                    setTriggerType(event.currentTarget.value)
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="ETA_BASED">ETA Based</option>
                  <option value="PORT_BASED">Port Based</option>
                  <option value="CARGO_CHANGE">Cargo Change</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </Field>
              <Field label="From name">
                <input
                  name="fromName"
                  placeholder="MariMail Marine Ops"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Tags">
                <input
                  name="tags"
                  placeholder="hold-cleaning, fujairah"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
                />
              </Field>
              <div className="flex flex-wrap gap-3 text-sm md:col-span-2">
                <Toggle name="stopOnReply" label="Stop on reply" />
                <Toggle name="stopOnBounce" label="Stop on bounce" />
                <Toggle name="stopOnUnsubscribe" label="Stop on unsubscribe" />
              </div>
            </div>

            <div
              className={step === 2 ? "grid gap-4 md:grid-cols-2" : "hidden"}
            >
              <Field label="Target ports">
                <select
                  multiple
                  name="portCodes"
                  className="mt-1 h-36 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {data.ports.map((port) => (
                    <option key={port.portCode} value={port.portCode}>
                      {port.portName} ({port.portCode})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vessel types">
                <select
                  multiple
                  name="vesselTypes"
                  className="mt-1 h-36 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {vesselTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              {triggerType === "CARGO_CHANGE" ? (
                <>
                  <Field label="Previous cargo CSV">
                    <input
                      name="previousCargo"
                      placeholder="ANY, COAL"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Next cargo CSV">
                    <input
                      name="nextCargo"
                      placeholder="GRAIN, FOOD_GRADE"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </>
              ) : null}
              <Field label="Rule priority">
                <input
                  name="priority"
                  type="number"
                  defaultValue={100}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <div
              className={step === 3 ? "grid gap-4 md:grid-cols-2" : "hidden"}
            >
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">
                  Company roles
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <Toggle
                    name="roles"
                    value="SHIP_OWNER"
                    label="Ship Owner contacts"
                  />
                  <Toggle
                    name="roles"
                    value="ISM_MANAGER"
                    label="ISM Manager contacts"
                  />
                  <Toggle
                    name="roles"
                    value="COMMERCIAL_MANAGER"
                    label="Commercial Manager contacts"
                  />
                </div>
              </div>
              <Field label="Contact lists">
                <select
                  multiple
                  name="contactListIds"
                  className="mt-1 h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {data.lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.contactCount})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div
              className={step === 4 ? "grid gap-4 md:grid-cols-2" : "hidden"}
            >
              <Field label="Daily campaign limit">
                <input
                  name="dailyLimit"
                  type="number"
                  defaultValue={500}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Timezone">
                <input
                  name="timezone"
                  defaultValue="UTC"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Start hour">
                <input
                  name="scheduleHourStart"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={9}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="End hour">
                <input
                  name="scheduleHourEnd"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={17}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </Field>
              <div className="flex flex-wrap gap-3 md:col-span-2">
                {[1, 2, 3, 4, 5].map((day) => (
                  <Toggle
                    key={day}
                    name="scheduleDays"
                    value={String(day)}
                    label={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][day]}
                  />
                ))}
              </div>
            </div>

            <div className={step === 5 ? "space-y-4" : "hidden"}>
              {sequences.map((sequence, index) => (
                <div
                  key={sequence.stepOrder}
                  className="rounded-md border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[120px,1fr,180px]">
                    <Field label="Day offset">
                      <input
                        type="number"
                        value={sequence.delayValue}
                        onChange={(event) =>
                          updateSequence(index, {
                            delayValue: Number(event.currentTarget.value),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label={`Step ${sequence.stepOrder} subject`}>
                      <input
                        value={sequence.subject}
                        onChange={(event) =>
                          updateSequence(index, {
                            subject: event.currentTarget.value,
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="Condition">
                      <select
                        value={sequence.conditionType}
                        onChange={(event) =>
                          updateSequence(index, {
                            conditionType: event.currentTarget
                              .value as SequenceDraft["conditionType"],
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="ALWAYS">Always</option>
                        <option value="IF_NOT_REPLIED">If not replied</option>
                        <option value="IF_NOT_OPENED">If not opened</option>
                      </select>
                    </Field>
                  </div>
                  <textarea
                    value={sequence.bodyHtml}
                    onChange={(event) =>
                      updateSequence(index, {
                        bodyHtml: event.currentTarget.value,
                      })
                    }
                    className="mt-3 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={sequence.abTestEnabled}
                      onChange={(event) =>
                        updateSequence(index, {
                          abTestEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                    Enable A/B subject/body split
                  </label>
                  {sequence.abTestEnabled ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Field label="Subject B">
                        <input
                          value={sequence.abSubjectB}
                          onChange={(event) =>
                            updateSequence(index, {
                              abSubjectB: event.currentTarget.value,
                            })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="Body B">
                        <input
                          value={sequence.abBodyHtmlB}
                          onChange={(event) =>
                            updateSequence(index, {
                              abBodyHtmlB: event.currentTarget.value,
                            })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </Field>
                      <Field label="A split %">
                        <input
                          type="number"
                          value={sequence.abSplit}
                          min={1}
                          max={99}
                          onChange={(event) =>
                            updateSequence(index, {
                              abSplit: Number(event.currentTarget.value),
                            })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={addSequence}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Add step
              </button>
            </div>

            <div
              className={
                step === 6
                  ? "rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                  : "hidden"
              }
            >
              <p className="font-semibold text-slate-950">
                Personalization preview variables
              </p>
              <p className="mt-1">
                Supported variables include vessel_name, imo_number,
                vessel_type, dwt, flag, eta_port, eta_date, eta_days,
                previous_cargo, next_cargo, ship_owner, first_name, company,
                title, and port_region.
              </p>
              <div className="mt-3 rounded-md bg-white p-3 text-xs text-slate-600 shadow-sm">
                {sequences[0]?.subject}
              </div>
            </div>

            <div
              className={
                step === 7
                  ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                  : "hidden"
              }
            >
              <p className="font-semibold">Activate</p>
              <p className="mt-1">
                Activation creates matching port or cargo rules. Future ETAs
                matching the rule will create ETATriggers and BullMQ eta-step
                jobs.
              </p>
              <Toggle name="activate" label="Activate immediately" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(Math.max(1, step - 1))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(Math.min(7, step + 1))}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  Next
                </button>
              </div>
              <div className="flex items-center gap-3">
                {message ? (
                  <p className="text-sm text-slate-600">{message}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={saving || pending}
                  className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save campaign"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {data.campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 xl:col-span-2">
            No campaigns yet.
          </div>
        ) : (
          data.campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))
        )}
      </section>
    </div>
  );
}

export function CampaignCard({
  campaign,
}: {
  campaign: CampaignDashboardData["campaigns"][number];
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusTone =
    campaign.status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700"
      : campaign.status === "DRAFT"
        ? "bg-slate-100 text-slate-600"
        : "bg-amber-100 text-amber-700";

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-ocean/30 hover:shadow-shell">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {campaign.name}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone}`}
            >
              {campaign.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {campaign.description ?? campaign.triggerType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Radar className="h-5 w-5 text-ocean" />
          {confirmDelete ? (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              title="Confirm delete"
              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "…" : "Confirm"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => (confirmDelete ? setConfirmDelete(false) : setConfirmDelete(true))}
            disabled={deleting}
            aria-label={confirmDelete ? "Cancel delete" : "Delete campaign"}
            title={confirmDelete ? "Cancel" : "Delete campaign"}
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            {confirmDelete ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Metric icon={Ship} label="Triggers" value={campaign.counts.triggers} />
        <Metric
          icon={MailPlus}
          label="Contacts"
          value={campaign.counts.contacts || campaign.counts.targeted}
          subtitle={
            campaign.counts.contacts > 0
              ? campaign.counts.targeted > campaign.counts.contacts
                ? `${campaign.counts.targeted} targeted`
                : undefined
              : campaign.counts.targeted > 0
                ? "Targeted (launch to enroll)"
                : undefined
          }
        />
        <Metric icon={Activity} label="Events" value={campaign.counts.events} />
        <Metric icon={Clock} label="Steps" value={campaign.sequences.length} />
      </div>
      <div className="mt-4 space-y-2">
        {campaign.sequences.slice(0, 3).map((sequence) => (
          <div
            key={sequence.id}
            className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"
          >
            <Send className="h-3.5 w-3.5 text-ocean" />
            <span className="font-semibold text-slate-800">
              Day {sequence.delayValue}
            </span>
            <span className="truncate">{sequence.subject}</span>
            {sequence.abTestEnabled ? (
              <Split className="ml-auto h-3.5 w-3.5 text-amber-600" />
            ) : null}
          </div>
        ))}
      </div>
      <Link
        href={`/dashboard/campaigns/${campaign.id}`}
        className="mt-4 inline-flex text-xs font-semibold text-ocean hover:underline"
      >
        View campaign details
      </Link>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-base font-semibold text-navy">{value}</p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="font-semibold text-navy">{value}</p>
      {subtitle ? (
        <p className="mt-0.5 text-[10px] text-slate-500" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Toggle({
  name,
  label,
  value = "on",
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
      <input
        name={name}
        value={value}
        type="checkbox"
        defaultChecked
        className="h-4 w-4 rounded border-slate-300"
      />
      <CheckCircle2 className="h-4 w-4 text-ocean" />
      {label}
    </label>
  );
}
