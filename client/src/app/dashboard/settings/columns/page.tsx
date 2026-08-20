import { ColumnPreferencesManager } from "@/components/settings/ColumnPreferencesManager";
import { SettingsCard } from "@/components/settings/SettingsCard";

export const dynamic = "force-dynamic";

/**
 * Column layouts for every customisable table, in one place.
 *
 * Each table already has its own "Customize" drawer, which is the right place
 * to adjust columns while you are looking at that table. What was missing is
 * the overview: how many tables you have reshaped, and a way to put one back
 * without navigating to it first.
 */
export default function ColumnsSettingsPage() {
  return (
    <SettingsCard
      title="Table columns"
      description="Which columns each table shows, and in what order. Saved in this browser only — a different device starts from the defaults."
    >
      <ColumnPreferencesManager />
    </SettingsCard>
  );
}
