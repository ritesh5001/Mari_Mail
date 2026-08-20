import { PersonaManager } from "@/components/settings/PersonaManager";
import { SettingsCard } from "@/components/settings/SettingsCard";

export const dynamic = "force-dynamic";

/**
 * Saved filter sets, manageable outside the panels that create them.
 *
 * Until now a saved set could only be reached from inside the Port Radar or
 * Lists filter modal: you could load one, or overwrite one with whatever was
 * currently on screen, and that was all. There was no way to see how many you
 * had, no way to tell two identically-named sets apart, and no way to change a
 * single field without rebuilding the whole filter and re-saving over it.
 */
export default function PersonasSettingsPage() {
  return (
    <SettingsCard
      title="Personas"
      description="Saved filter sets for Port Radar and contact search. Load them from the filter panel on either page; edit, rename and tidy them here."
    >
      <PersonaManager />
    </SettingsCard>
  );
}
