import { redirect } from "next/navigation";

/**
 * Settings has a persistent section nav in the layout, so an index page would
 * be a second copy of that list and one more click to get anywhere. Land on
 * Profile instead.
 *
 * The old index was a card grid of three links plus an empty "Coming soon"
 * panel — light-mode only, and with an unused icon import.
 */
export default function SettingsPage() {
  redirect("/dashboard/settings/profile");
}
