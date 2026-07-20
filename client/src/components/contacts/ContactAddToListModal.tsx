"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type ContactList = {
  id: string;
  name: string;
  color: string;
  contactCount: number;
};

type Props = {
  contactIds: string[];
  onClose: () => void;
  onDone: (listName: string, count: number) => void;
};

export function ContactAddToListModal({ contactIds, onClose, onDone }: Props) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    apiFetch(`/api/lists?scope=my`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: { lists?: ContactList[] } } | null) => {
        setLists(payload?.data?.lists ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreateList() {
    if (!newListName.trim()) return;
    setCreatingNew(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim(), type: "STATIC" }),
      });
      const payload = (await r.json()) as { data?: ContactList; error?: { message?: string } };
      if (!r.ok) throw new Error(payload.error?.message ?? "Failed to create list");
      const created = payload.data!;
      setLists((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setNewListName("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingNew(false);
    }
  }

  async function handleAdd() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiFetch(`/api/lists/${selectedId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      const payload = (await r.json()) as { data?: { added?: number }; error?: { message?: string } };
      if (!r.ok) throw new Error(payload.error?.message ?? "Failed to add contacts");
      const listName = lists.find((l) => l.id === selectedId)?.name ?? "list";
      onDone(listName, payload.data?.added ?? contactIds.length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Add to List</p>
            <p className="text-xs text-slate-500">{contactIds.length} contact{contactIds.length !== 1 ? "s" : ""} selected</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
              placeholder="Create new list…"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-ocean"
              disabled={creatingNew}
            />
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim() || creatingNew}
              className="inline-flex items-center gap-1 rounded-md bg-ocean px-3 py-2 text-xs font-semibold text-white hover:bg-navy disabled:opacity-50"
            >
              {creatingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              New
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : lists.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No lists yet — create one above.</p>
          ) : (
            <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    onClick={() => setSelectedId(list.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${selectedId === list.id ? "bg-ocean/5" : ""}`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
                    <span className="flex-1 font-medium text-slate-800">{list.name}</span>
                    <span className="text-xs text-slate-400">{list.contactCount}</span>
                    {selectedId === list.id && <Check className="h-4 w-4 text-ocean" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedId || submitting}
            className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-ocean disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to list
          </button>
        </div>
      </div>
    </div>
  );
}
