import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

/**
 * Shared shell for the static legal pages — Privacy, Terms, Security, DPA.
 * Renders the same MarketingNav/Footer so users land on a familiar surface
 * when they click a footer link, and the article body sits on a light card
 * that reads well against the black marketing background.
 */
export function LegalPageShell({
  title,
  updatedAt,
  intro,
  children,
}: {
  title: string;
  updatedAt: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main
      data-marketing-root
      className="marketing-root relative min-h-screen overflow-x-clip bg-black text-white"
    >
      <MarketingNav />
      <section className="mx-auto w-full max-w-3xl px-6 pb-24 pt-40">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Last updated · {updatedAt}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-300">{intro}</p>

        <article className="mt-10 space-y-8 text-[15px] leading-7 text-slate-300 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_a]:text-sky-300 [&_a]:underline [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_p]:mt-3">
          {children}
        </article>
      </section>
      <MarketingFooter />
    </main>
  );
}
