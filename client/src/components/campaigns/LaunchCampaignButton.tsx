"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { SequenceCampaignWizard, type CampaignSeed } from "./SequenceCampaignWizard";

function LaunchButton({ seed, label = "Launch campaign", disabled }: { seed: CampaignSeed; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <SequenceCampaignWizard seed={seed} onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-ocean/90 disabled:opacity-40 dark:bg-accent-600 dark:hover:bg-accent-500"
      >
        <Send className="h-4 w-4" />
        {label}
      </button>
    </>
  );
}

export function LaunchCampaignFromSaved({ contactIds, count }: { contactIds: string[]; count: number }) {
  return <LaunchButton seed={{ kind: "contacts", contactIds, label: "Saved contacts" }} label={`Launch campaign (${count})`} />;
}

export function LaunchCampaignFromList({ listId, listName, count }: { listId: string; listName: string; count: number }) {
  return <LaunchButton seed={{ kind: "list", listId, label: listName, count }} />;
}

export function LaunchCampaignFromListRole({
  listId,
  listName,
  marineRoles,
  count,
  label,
}: {
  listId: string;
  listName: string;
  marineRoles: string[];
  count: number;
  label?: string;
}) {
  return (
    <LaunchButton
      seed={{ kind: "list-role", listId, marineRoles, label: listName, count }}
      label={label ?? `Launch campaign (${count})`}
      disabled={count === 0 || marineRoles.length === 0}
    />
  );
}

export function LaunchCampaignFromSelection({ contactIds }: { contactIds: string[] }) {
  return (
    <LaunchButton
      seed={{ kind: "contacts", contactIds, label: "Selected contacts" }}
      label={`Launch campaign${contactIds.length ? ` (${contactIds.length})` : ""}`}
      disabled={contactIds.length === 0}
    />
  );
}
