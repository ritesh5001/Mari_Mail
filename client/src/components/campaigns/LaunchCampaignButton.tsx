"use client";

import { useState } from "react";
import { Rocket } from "lucide-react";
import { SequenceCampaignWizard, type CampaignSeed } from "./SequenceCampaignWizard";
import { MotionButton } from "@/components/ui/motion-button";

function LaunchButton({ seed, label = "Launch campaign", disabled }: { seed: CampaignSeed; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <SequenceCampaignWizard seed={seed} onClose={() => setOpen(false)} />}
      <MotionButton
        type="button"
        size="sm"
        tone="green"
        icon={<Rocket className="size-4" />}
        onClick={() => setOpen(true)}
        disabled={disabled}
        label={label}
      />
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
