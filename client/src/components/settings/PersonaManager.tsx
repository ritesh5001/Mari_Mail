"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Copy, Loader2, Pencil, Radar, Trash2, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import { countActive, summarizePersona, type PersonaConfig } from "@/lib/persona-fields";
import { normalizeRoleFilter, type RoleFilter } from "@/components/lists/RoleFilterPanel";

/**
 * Both panels are large and only mount once someone clicks Edit, so they are
 * loaded on demand — importing them statically put ~30 kB on the page for
 * people who only came to rename or delete a set.
 */
const VesselFilterPanel = dynamic(
  () => import("@/components/marine/VesselFilterPanel").then((m) => m.VesselFilterPanel),
  { ssr: false, loading: () => <PanelSkeleton /> },
);

const RoleFilterPanel = dynamic(
  () => import("@/components/lists/RoleFilterPanel").then((m) => m.RoleFilterPanel),
  { ssr: false, loading: () => <PanelSkeleton /> },
);

function PanelSkeleton() {
  return (
    <div className="h-10 w-40 animate-pulse rounded-md bg-slate-100 dark:bg-white/[0.06]" />
  );
}

/**
 * Narrow a stored config to the shape VesselFilterPanel parses.
 *
 * `filterConfig` is `unknown`-valued JSON, and the panel's readers only handle
 * `string | string[] | undefined` — a number or a nested object would fall
 * straight through them and silently vanish from the rebuilt state. Dropping
 * non-string values here makes that explicit; they are still preserved in the
 * saved object, since the editor spreads over the original config on save.
 */
function toSearchParams(config: PersonaConfig): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return out;
}


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
 * Editing a persona, using the same filter UI that created it.
 *
 * The first version of this page rendered a generic list of text inputs and
 * chip rows derived from the stored keys. It worked, but it was a second,
 * worse filter builder: no port lookup, no vessel-type tree, no title
 * suggestions, no seniority vocabulary — just whatever strings you could type
 * from memory. Editing "Brazil" meant knowing that `destCountry` wanted `BR`.
 *
 * So it mounts the real panels instead:
 *
 *   ETA      → VesselFilterPanel in its modal orientation, seeded by passing
 *              the stored config straight in as `searchParams`. That works
 *              because a saved set IS the query-string object the panel emits
 *              (`stateToParams`), so it round-trips through the same parser
 *              the address bar uses.
 *   CONTACT  → RoleFilterPanel, which was already value-driven
 *              (`value`/`onChange`/`onApply`) and needed no changes at all.
 *
 * Both are given an apply handler that hands the filter back rather than
 * navigating — see `onApply` on VesselFilterPanel. Nothing is written until
 * "Save changes", so Apply here means "keep this edit", not "run it".
 *
 * Writes through PATCH, which already existed for the panels' overwrite
 * action, so name and body are saved in one statement.
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
  const [name, setName] = useState(persona.name);
  const [config, setConfig] = useState<PersonaConfig>(persona.filterConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cleared once the user commits a change in the panel, so the summary below
  // never claims an edit was captured when it wasn't.
  const [edited, setEdited] = useState(false);

  const dirty = edited || name.trim() !== persona.name.trim();

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

      <div className="mt-4 space-y-4">
        <div className="max-w-md">
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

        <div>
          <span className="block text-xs font-medium text-slate-600 dark:text-white/60">
            Filter
          </span>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
            {summarizePersona(persona.entityType, config)}
          </p>

          <div className="mt-2">
            <PersonaFilterEditor
              persona={persona}
              config={config}
              onChange={(next) => {
                setConfig(next);
                setEdited(true);
              }}
            />
          </div>
        </div>

        {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="flex items-center gap-2 border-t border-slate-200 pt-4 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
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
          {dirty ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Mounts whichever real filter panel produced this persona.
 *
 * Anything else — the legacy `groups` shape, or an entity type no panel
 * builds — falls through to a notice rather than a broken editor. Its stored
 * config is left completely untouched, so renaming one is still safe.
 */
function PersonaFilterEditor({
  persona,
  config,
  onChange,
}: {
  persona: Persona;
  config: PersonaConfig;
  onChange: (next: PersonaConfig) => void;
}) {
  if (persona.entityType === "ETA" || persona.entityType === "VESSEL") {
    return (
      <VesselFilterPanel
        // The stored config doubles as the panel's searchParams — see the note
        // on PersonaEditor.
        searchParams={toSearchParams(config)}
        orientation="modal"
        hideSavedSets
        applyLabel="Use this filter"
        // Replaces the config outright rather than merging over it. The panel
        // omits a key whose field is empty, so merging would leave a cleared
        // "Minimum DWT" standing and the edit would appear not to take. Safe
        // because an ETA set is produced entirely by this panel — verified
        // against production, where no ETA persona carries a key it doesn't own.
        onApply={(next) => onChange(next)}
      />
    );
  }

  if (persona.entityType === "CONTACT") {
    return <ContactPersonaEditor config={config} onChange={onChange} />;
  }

  return (
    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-white/55">
      This persona type has no filter builder. You can still rename, duplicate or delete it.
    </p>
  );
}

/**
 * RoleFilterPanel keeps its draft in the parent, so this holds one and commits
 * it on Apply — matching the ETA side, where nothing is captured until the
 * user says so.
 *
 * The suggestion loaders the list page passes are deliberately omitted: they
 * are scoped to a specific list's vessel domains, and there is no list here.
 * The panel degrades to free typing, which is what it does on an empty list.
 */
function ContactPersonaEditor({
  config,
  onChange,
}: {
  config: PersonaConfig;
  onChange: (next: PersonaConfig) => void;
}) {
  const [draft, setDraft] = useState<RoleFilter>(() => normalizeRoleFilter(config));

  return (
    <RoleFilterPanel
      value={draft}
      onChange={setDraft}
      onApply={() => {
        // Preserve unrecognised keys (e.g. a legacy `groups`) rather than
        // replacing the stored object wholesale.
        onChange({ ...config, ...draft });
      }}
      scope="apollo"
    />
  );
}
