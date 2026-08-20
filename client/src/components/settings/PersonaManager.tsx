"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Pencil, Radar, Trash2, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import {
  PERSONA_FIELDS,
  countActive,
  readField,
  summarizePersona,
  writeField,
  type PersonaConfig,
  type PersonaField,
} from "@/lib/persona-fields";

type Persona = {
  id: string;
  name: string;
  entityType: "VESSEL" | "CONTACT" | "COMPANY" | "ETA";
  filterConfig: PersonaConfig;
  createdAt: string;
};

const TYPE_META = {
  ETA: { label: "Port Radar", icon: Radar, where: "the ETA filter on Port Radar" },
  CONTACT: { label: "Contacts", icon: Users, where: "the role filter on a list" },
  VESSEL: { label: "Vessels", icon: Radar, where: "the vessel filter" },
  COMPANY: { label: "Companies", icon: Users, where: "the company filter" },
} as const;

export function PersonaManager() {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // No entityType filter: Settings is the one place that shows every kind
      // at once. The panels each request only their own.
      const res = await apiFetch("/api/saved-filters");
      const payload = (await res.json()) as {
        data?: { filters?: Persona[] };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(payload.error?.message ?? "Could not load your personas");
      setPersonas(payload.data?.filters ?? []);
    } catch (err) {
      setError((err as Error).message);
      setPersonas([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function duplicate(persona: Persona) {
    setBusyId(persona.id);
    setError(null);
    try {
      const res = await apiFetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${persona.name} copy`,
          entityType: persona.entityType,
          filterConfig: persona.filterConfig,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Could not duplicate");
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/saved-filters/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Could not delete");
      }
      setPersonas((prev) => prev?.filter((row) => row.id !== id) ?? null);
      setConfirmDelete(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (personas === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (editing) {
    return (
      <PersonaEditor
        persona={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    );
  }

  const grouped = (["ETA", "CONTACT", "VESSEL", "COMPANY"] as const)
    .map((type) => ({ type, rows: personas.filter((row) => row.entityType === type) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div>
      {error ? <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {personas.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-white/45">
          No personas yet. Build a filter on Port Radar or a list, then use{" "}
          <strong>Save set</strong> in the filter panel — it will show up here.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => {
            const meta = TYPE_META[group.type];
            const Icon = meta.icon;
            return (
              <div key={group.type}>
                <p className="flex items-center gap-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-white/[0.06] dark:border-white/10">
                  {group.rows.map((persona) => {
                    const active = countActive(persona.entityType, persona.filterConfig);
                    const deleting = confirmDelete === persona.id;
                    return (
                      <li key={persona.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {persona.name}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/45">
                              {summarizePersona(persona.entityType, persona.filterConfig)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400 dark:text-white/30">
                              {active} {active === 1 ? "field" : "fields"} set · loads from{" "}
                              {meta.where}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <IconAction
                              label="Edit"
                              onClick={() => setEditing(persona)}
                              icon={<Pencil className="h-3.5 w-3.5" />}
                            />
                            <IconAction
                              label="Duplicate"
                              onClick={() => duplicate(persona)}
                              busy={busyId === persona.id}
                              icon={<Copy className="h-3.5 w-3.5" />}
                            />
                            <IconAction
                              label="Delete"
                              danger
                              onClick={() => setConfirmDelete(persona.id)}
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                            />
                          </div>
                        </div>

                        {deleting ? (
                          <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-500/10">
                            <p className="flex-1 text-xs text-red-700 dark:text-red-300">
                              Delete &ldquo;{persona.name}&rdquo;? This can&rsquo;t be undone.
                            </p>
                            <button
                              type="button"
                              onClick={() => remove(persona.id)}
                              disabled={busyId === persona.id}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 dark:text-white/60"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  busy,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-md p-1.5 transition-colors disabled:opacity-40",
        danger
          ? "text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          : "text-slate-400 hover:bg-slate-100 hover:text-accent-600 dark:hover:bg-white/[0.06] dark:hover:text-accent-300",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
    </button>
  );
}

/**
 * Field-level editing of a persona.
 *
 * Writes back through PATCH, which already existed for the panels' "overwrite
 * this set" action — so renaming and editing the body share one atomic
 * statement rather than the delete-then-recreate this used to be.
 *
 * Unknown keys are carried through untouched: the editor starts from the
 * stored config and only replaces keys it recognises, so a field added by a
 * newer panel version survives a round trip through this page.
 */
function PersonaEditor({
  persona,
  onCancel,
  onSaved,
}: {
  persona: Persona;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const fields = PERSONA_FIELDS[persona.entityType] ?? [];
  const [name, setName] = useState(persona.name);
  const [config, setConfig] = useState<PersonaConfig>(persona.filterConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A handful of older sets were saved by a condition-group builder and store
   * their criteria under `groups` rather than the flat keys the panels write
   * today. The fields below would all render empty for one, which reads as
   * "this persona is blank" when it isn't — so say so instead.
   *
   * Editing is still safe: only fields the user actually touches are written,
   * and unrecognised keys are carried through untouched.
   */
  const legacyShape =
    Array.isArray((config as { groups?: unknown }).groups) &&
    fields.every((field) => readField(config, field).length === 0);

  async function save() {
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/saved-filters/${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filterConfig: config }),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Could not save");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/[0.08]">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Edit persona</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 max-w-lg space-y-4">
        <div>
          <label
            htmlFor="persona-name"
            className="block text-xs font-medium text-slate-600 dark:text-white/60"
          >
            Name
          </label>
          <input
            id="persona-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
          />
        </div>

        {legacyShape ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            This set was saved in an older format, so its criteria can&rsquo;t be shown here. Renaming
            is safe and its filter is left untouched. To rebuild it, load the set from the filter
            panel and save over it.
          </p>
        ) : null}

        {fields.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-white/45">
            This persona type has no editable fields here — you can still rename, duplicate or
            delete it.
          </p>
        ) : (
          fields.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              values={readField(config, field)}
              onChange={(values) => setConfig((prev) => writeField(prev, field, values))}
            />
          ))
        )}

        {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/[0.06]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  values,
  onChange,
}: {
  field: PersonaField;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const isList = field.kind === "chips" || field.kind === "csv";

  if (!isList) {
    const inputType = field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text";
    return (
      <div>
        <label
          htmlFor={`persona-${field.key}`}
          className="block text-xs font-medium text-slate-600 dark:text-white/60"
        >
          {field.label}
        </label>
        <input
          id={`persona-${field.key}`}
          type={inputType}
          value={values[0] ?? ""}
          onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
        {field.hint ? (
          <p className="mt-1 text-[11px] text-slate-400 dark:text-white/30">{field.hint}</p>
        ) : null}
      </div>
    );
  }

  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div>
      <span className="block text-xs font-medium text-slate-600 dark:text-white/60">
        {field.label}
      </span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-accent-500/25 bg-accent-500/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-700 dark:text-accent-300"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`Remove ${value}`}
              className="rounded-full p-0.5 hover:bg-accent-500/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-white/30">Not set</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-accent-400 hover:text-accent-600 disabled:opacity-40 dark:border-white/10 dark:text-white/70"
        >
          Add
        </button>
      </div>
      {field.hint ? (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-white/30">{field.hint}</p>
      ) : null}
    </div>
  );
}
