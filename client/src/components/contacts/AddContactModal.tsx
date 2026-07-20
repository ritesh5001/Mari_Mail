"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { CONTACT_SCHEMA_FIELDS } from "@/lib/contact-schema";

const MARINE_ROLES = ["FLEET_MANAGER","SHIP_SUPERINTENDENT","TECHNICAL_MANAGER","CREWING_MANAGER","CHARTERING_MANAGER","PORT_CAPTAIN","MARINE_SURVEYOR","CLASS_SURVEYOR","UNDERWRITER","BROKER","PORT_AGENT","CHANDLER","BUNKER_TRADER","OPA_PROVIDER","OTHER"] as const;
const SENIORITIES = ["INTERN","ENTRY","MID","SENIOR","LEAD","MANAGER","DIRECTOR","VP","C_LEVEL","FOUNDER","OWNER"] as const;

const inputCls = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition focus:border-accent-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30";
const labelCls = "block text-xs font-medium text-slate-600 dark:text-white/60 mb-1";
const schemaGroups = ["Identity", "Company", "Communication", "Digital", "CRM"];

export function AddContactModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => ({
    marineRole: "OTHER",
    seniority: "MID",
    ...Object.fromEntries(CONTACT_SCHEMA_FIELDS.map((field) => [field.key, ""])),
  }));

  function set(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {
      firstName: form.firstName, lastName: form.lastName,
      email: form.email, companyName: form.companyName,
      marineRole: form.marineRole, seniority: form.seniority,
    };
    for (const field of CONTACT_SCHEMA_FIELDS) {
      const raw = form[String(field.key)]?.trim();
      if (!raw) continue;
      body[String(field.key)] = field.key === "department" ? raw.split(/[;,|]/).map((part) => part.trim()).filter(Boolean) : raw;
    }

    const res = await apiFetch(`/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) { setError(json.error?.message ?? "Failed to add contact"); return; }
    startTransition(() => { router.refresh(); onClose(); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0F0F11]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Add contact</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-white/50">Manually add a contact with the full contact schema.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:text-white/40 dark:hover:bg-white/[0.08]"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="min-h-0 space-y-4 overflow-y-auto px-6 pb-6">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Marine role</label>
              <select value={form.marineRole} onChange={(e) => set("marineRole", e.target.value)} className={inputCls}>
                {MARINE_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Seniority</label>
              <select value={form.seniority} onChange={(e) => set("seniority", e.target.value)} className={inputCls}>
                {SENIORITIES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          {schemaGroups.map((group) => (
            <section key={group} className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">{group}</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {CONTACT_SCHEMA_FIELDS.filter((field) => field.group === group).map((field) => {
                  const key = String(field.key);
                  const required = key === "firstName" || key === "lastName" || key === "email" || key === "companyName";
                  return (
                    <div key={field.label}>
                      <label className={labelCls}>
                        {field.label} {required ? <span className="text-red-500">*</span> : null}
                      </label>
                      <input
                        value={form[key] ?? ""}
                        onChange={(event) => set(key, event.target.value)}
                        type={key === "email" || key === "secondaryEmail" ? "email" : "text"}
                        className={inputCls}
                        required={required}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white py-4 dark:border-white/10 dark:bg-[#0F0F11]">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]">Cancel</button>
            <button type="submit" disabled={pending} className="rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60">
              {pending ? "Adding…" : "Add contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
