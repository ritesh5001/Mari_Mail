import { redirect } from "next/navigation";

/**
 * Blocked moved into Settings, beside the other standing workspace rules.
 * This stub keeps the old URL working for bookmarks and anything that still
 * links to it.
 */
export default function LegacyBlockedRedirect() {
  redirect("/dashboard/settings/blocked");
}
