"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Ship, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";
import { CreateListModal } from "@/components/lists/CreateListModal";

type ContactList = {
  id: string;
  name: string;
  color: string;
  contactCount: number;
  vesselCount: number;
  type: string;
  // ETA vs CONTACT stored inside filterConfig JSON so we can differentiate
  // manually-created lists without a schema migration.
  filterConfig?: { kind?: "ETA" | "CONTACT" } | null;
};

function listKind(list: ContactList): "ETA" | "CONTACT" {
  const explicit = list.filterConfig?.kind;
  if (explicit === "ETA" || explicit === "CONTACT") return explicit;
  // Legacy lists (created before we tracked kind) fall back to vessel count:
  // any vessels ⇒ ETA-style, otherwise Contact-style. This keeps existing
  // lists looking correct without a backfill.
  return list.vesselCount > 0 ? "ETA" : "CONTACT";
}

export function SavedListsPanel() {
  const router = useRouter();
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/lists?scope=my`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: { lists?: ContactList[] } } | null) => {
        if (active) {
          setLists(payload?.data?.lists ?? []);
          setLoading(false);
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const etaLists = lists.filter((list) => listKind(list) === "ETA");
  const contactLists = lists.filter((list) => listKind(list) === "CONTACT");

  async function deleteList(list: ContactList) {
    // Native confirm keeps this a one-tap operation from the card — a full
    // modal felt heavy for a bulk-manage view. Server enforces ownership so
    // no way to nuke a list you didn't create.
    const ok = window.confirm(
      `Delete "${list.name}"? Contacts and vessels stay in the database — only the list is removed.`,
    );
    if (!ok) return;
    // Optimistic: drop from local state, then reconcile if the request fails.
    const previous = lists;
    setLists((prev) => prev.filter((entry) => entry.id !== list.id));
    const res = await apiFetch(`/api/lists/${list.id}`, { method: "DELETE" });
    if (!res.ok) {
      setLists(previous);
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      alert(body?.error?.message ?? `Delete failed (${res.status})`);
    }
  }

  return (
    <>
      {showCreate ? (
        <CreateListModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            router.push(`/dashboard/lists/${created.id}`);
          }}
        />
      ) : null}
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">My Lists</p>
            <p className="text-xs text-slate-400 dark:text-white/40">Private to you</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-3 py-1.5 text-xs font-semibold text-white hover:bg-ocean/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create list
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center rounded-lg border border-slate-200 bg-white py-10 dark:border-white/10 dark:bg-white/5">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : lists.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white py-10 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-slate-500 dark:text-white/60">
              No lists yet. Create one to import contacts or track vessels.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ocean px-3 py-1.5 text-xs font-semibold text-white hover:bg-ocean/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create your first list
            </button>
          </div>
        ) : (
          <>
            <ListSection
              title="ETA lists"
              description="Contacts + companies + vessels. Used to power ETA campaigns."
              icon={<Ship className="h-4 w-4 text-ocean" />}
              lists={etaLists}
              emptyLabel="No ETA lists yet."
              onDelete={deleteList}
            />
            <ListSection
              title="Contact lists"
              description="Contacts + companies only. Used to power cold campaigns."
              icon={<Users className="h-4 w-4 text-emerald-600" />}
              lists={contactLists}
              emptyLabel="No contact lists yet."
              onDelete={deleteList}
            />
          </>
        )}
      </div>
    </>
  );
}

function ListSection({
  title,
  description,
  icon,
  lists,
  emptyLabel,
  onDelete,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  lists: ContactList[];
  emptyLabel: string;
  onDelete: (list: ContactList) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950 dark:text-white">{title}</p>
          <p className="text-xs text-slate-500 dark:text-white/50">{description}</p>
        </div>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-white/70">
          {lists.length}
        </span>
      </div>

      {lists.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-white/10">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => {
            const isEta = listKind(list) === "ETA";
            return (
              <div
                key={list.id}
                className={`group relative flex items-center gap-3 rounded-lg border px-3 py-3 hover:border-ocean ${
                  isEta
                    ? "border-sky-200 bg-sky-50/40 dark:border-sky-500/30 dark:bg-sky-500/[0.03]"
                    : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/[0.03]"
                }`}
              >
                <Link
                  href={`/dashboard/lists/${list.id}`}
                  className="absolute inset-0 rounded-lg"
                  aria-label={`Open ${list.name}`}
                />
                <span
                  className="pointer-events-none relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${isEta ? "#4F6DFF" : "#059669"}22` }}
                >
                  {isEta ? (
                    <Ship className="h-4 w-4" style={{ color: "#4F6DFF" }} />
                  ) : (
                    <Users className="h-4 w-4" style={{ color: "#059669" }} />
                  )}
                </span>
                <div className="pointer-events-none relative min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{list.name}</p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    {list.contactCount} contacts
                    {isEta ? ` · ${list.vesselCount} vessels` : ""}
                  </p>
                </div>
                {/* Delete button sits above the overlay Link so its click
                    doesn't navigate. Only visible on hover / focus to keep
                    the card visually clean at rest. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(list);
                  }}
                  className="relative z-10 rounded-md p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  aria-label={`Delete ${list.name}`}
                  title="Delete list"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
