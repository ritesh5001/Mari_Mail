import { Search, Workflow, Send, TrendingUp } from "lucide-react";

const pillars = [
  {
    icon: Search,
    title: "Find",
    description: "Quality vessel contacts, zero guesswork",
  },
  {
    icon: Workflow,
    title: "Automate",
    description: "Campaigns build themselves on ETA triggers",
  },
  {
    icon: Send,
    title: "Deliver",
    description: "Land in the inbox, not the void",
  },
  {
    icon: TrendingUp,
    title: "Convert",
    description: "Turn replies into chartered revenue",
  },
];

export function Pillars() {
  return (
    <section id="product" className="relative scroll-mt-24 bg-black py-24 lg:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-[3.5rem]">
            Where Marine Sales Meets AI.
            <br />
            The <span className="violet-accent">MariMail</span> Way
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <article
              key={p.title}
              className="premium-card group flex h-full flex-col rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.055] to-white/[0.025] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-500 hover:-translate-y-2 hover:border-accent-500/30 hover:bg-[#13131680] hover:shadow-[0_24px_80px_rgba(7, 89, 133,0.16)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-12 text-2xl font-semibold tracking-tight text-white">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                {p.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
