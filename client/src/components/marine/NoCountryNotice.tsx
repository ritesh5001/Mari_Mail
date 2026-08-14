import { Globe } from "lucide-react";

/**
 * Shown when a workspace has no target country on record.
 *
 * Every ETA figure is genuinely zero in that state, and silence would read as
 * "the product is empty" rather than "this workspace isn't pointed anywhere
 * yet".
 *
 * Deliberately READ-ONLY. This used to be a picker that let anyone set the
 * country from here, which quietly made a priced entitlement — how many
 * countries a plan covers, and which ones — self-serve and free to change. The
 * choice is made at onboarding and governed by the plan; changing it afterwards
 * goes through support, so it stays consistent with what was paid for.
 */
export function NoCountryNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800/40 dark:bg-amber-900/15">
      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <div className="text-amber-800 dark:text-amber-200">
        <p className="font-semibold">No target country set for this workspace</p>
        <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-200/80">
          Port Radar and vessel figures are filtered to the countries your plan covers, so nothing can be shown until
          one is set. It&rsquo;s normally chosen during onboarding — contact support and we&rsquo;ll set it for you.
        </p>
      </div>
    </div>
  );
}
