const faqs = [
  {
    question: "How does MariMail protect deliverability?",
    answer:
      "MariMail sends through your connected inboxes, rotates volume across accounts, tracks bounce and reply signals, and keeps suppression rules in place so campaigns scale without reckless blasting.",
  },
  {
    question: "Can campaigns trigger from vessel ETAs?",
    answer:
      "Yes. You can build outreach around port arrivals, ETA windows, vessel attributes, cargo context, and saved smart lists, then schedule each step at the right offset.",
  },
  {
    question: "Do we use our own SMTP or Gmail accounts?",
    answer:
      "Yes. MariMail supports Gmail, Outlook, and standard IMAP/SMTP sending, so mail leaves from infrastructure you control instead of a shared third-party sending pool.",
  },
  {
    question: "Where does vessel and contact data come from?",
    answer:
      "MariMail combines your workspace data with vessel records, IMO context, port intelligence, and imported contact lists so teams can qualify accounts before writing.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Every plan starts with a 14-day free trial and no credit card up front. You can test vessel search, connected inboxes, and campaign flows before committing.",
  },
  {
    question: "What integrations are supported?",
    answer:
      "MariMail works with Gmail, Outlook, IMAP/SMTP inboxes, marine data workflows, BullMQ-backed scheduling, and Postgres-based operational data. Enterprise teams can discuss custom feeds.",
  },
  {
    question: "How is maritime outreach data secured?",
    answer:
      "Workspace access is permissioned, sending credentials stay tied to your accounts, and campaign activity is logged so teams can audit who contacted which vessel or operator.",
  },
  {
    question: "What support tiers are available?",
    answer:
      "Starter includes email support, Pro adds priority help for campaign setup and deliverability, and Fleet includes onboarding support for larger brokerages and shipping desks.",
  },
];

export function Faq() {
  return (
    <section id="faqs" className="relative scroll-mt-24 bg-black py-24 lg:py-32">
      <div className="mx-auto w-full max-w-4xl px-6">
        <div className="text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-[3.5rem]">
            Questions before you{" "}
            <span className="violet-accent">come aboard</span>?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-white/60 md:text-lg">
            The practical details marine teams ask before connecting inboxes,
            vessel data, and automated outreach.
          </p>
        </div>

        <div className="mt-14 divide-y divide-white/10 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-[#0F0F11] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-6 transition-colors hover:bg-white/[0.025]">
              <summary className="cursor-pointer list-none pr-8 font-serif text-2xl italic leading-snug text-accent-300 outline-none transition-colors marker:hidden group-open:text-white [&::-webkit-details-marker]:hidden">
                {faq.question}
              </summary>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70 md:text-base">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
