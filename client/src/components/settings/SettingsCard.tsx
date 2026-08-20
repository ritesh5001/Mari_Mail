/**
 * The one card shape every settings section uses.
 *
 * Settings pages are a long column of "here is a thing, here is what it does,
 * here is the control" — writing that border/padding/heading stack by hand in
 * each page is how the pages start disagreeing about spacing.
 */
export function SettingsCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Optional control aligned with the heading, e.g. a "New" button. */
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-white/45">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
