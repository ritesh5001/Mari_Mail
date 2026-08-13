"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

// --- Types -----------------------------------------------------------------

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Map of category-key → human label, e.g. { platform: "Platform & Features" }. */
export type FaqCategories = Record<string, string>;

/** Map of category-key → its list of Q&As. Keys must match `categories`. */
export type FaqData = Record<string, FaqEntry[]>;

export interface FAQProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  categories: FaqCategories;
  faqData: FaqData;
}

// --- Root component --------------------------------------------------------

/**
 * Tabbed FAQ, adapted for this repo:
 *  - imports `@/lib/cn` (this project's class-merge util), not `@/lib/utils`.
 *  - fully typed (the source snippet was untyped JS; this codebase is strict
 *    TypeScript).
 *  - the stock shadcn tokens (`primary`, `muted`, `card`, `border`,
 *    `background`, `foreground`) aren't defined here, so it uses the MariMail
 *    brand-blue scale (accent-500/600 = #4F6DFF / #3B4FE6) with concrete
 *    slate/white values + `dark:` variants so it themes with the marketing
 *    site.
 */
export const FAQ: React.FC<FAQProps> = ({
  title = "FAQs",
  subtitle = "Frequently Asked Questions",
  categories,
  faqData,
  className,
  ...props
}) => {
  const categoryKeys = Object.keys(categories);
  const [selectedCategory, setSelectedCategory] = React.useState(categoryKeys[0]);

  return (
    <section
      className={cn(
        "relative overflow-hidden px-4 py-12 text-slate-900 dark:text-white",
        className,
      )}
      {...props}
    >
      <FAQHeader title={title} subtitle={subtitle} />
      <FAQTabs
        categories={categories}
        selected={selectedCategory}
        setSelected={setSelectedCategory}
      />
      <FAQList faqData={faqData} selected={selectedCategory} />
    </section>
  );
};

const FAQHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="relative z-10 flex flex-col items-center justify-center text-center">
    <span className="mb-4 bg-gradient-to-r from-accent-500 to-accent-400 bg-clip-text font-medium text-transparent">
      {subtitle}
    </span>
    <h2 className="mb-8 text-4xl font-bold tracking-tight md:text-5xl">{title}</h2>
    <span
      aria-hidden
      className="absolute -top-[350px] left-1/2 z-0 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-r from-accent-500/10 to-accent-500/5 blur-3xl"
    />
  </div>
);

const FAQTabs: React.FC<{
  categories: FaqCategories;
  selected: string;
  setSelected: (key: string) => void;
}> = ({ categories, selected, setSelected }) => (
  <div className="relative z-10 flex flex-wrap items-center justify-center gap-3">
    {Object.entries(categories).map(([key, label]) => (
      <button
        key={key}
        type="button"
        onClick={() => setSelected(key)}
        className={cn(
          "relative overflow-hidden whitespace-nowrap rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors duration-500",
          selected === key
            ? // Active pill sits on the blue gradient — force white via an
              // arbitrary value so the marketing `.text-white → dark ink`
              // light-mode override can't flip it.
              "border-accent-500 text-[#ffffff]"
            : "border-slate-300 bg-transparent text-slate-600 hover:text-slate-900 dark:border-white/15 dark:text-white/70 dark:hover:text-white",
        )}
      >
        <span className="relative z-10 text-inherit">{label}</span>
        <AnimatePresence>
          {selected === key && (
            <motion.span
              initial={{ y: "100%" }}
              animate={{ y: "0%" }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.5, ease: "backIn" }}
              className="absolute inset-0 z-0 bg-gradient-to-r from-accent-500 to-accent-600"
            />
          )}
        </AnimatePresence>
      </button>
    ))}
  </div>
);

const FAQList: React.FC<{ faqData: FaqData; selected: string }> = ({ faqData, selected }) => (
  <div className="mx-auto mt-12 max-w-3xl">
    <AnimatePresence mode="wait">
      {Object.entries(faqData).map(([category, questions]) => {
        if (selected !== category) return null;
        return (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: "backIn" }}
            className="space-y-4"
          >
            {questions.map((faq, index) => (
              <FAQItem key={index} question={faq.question} answer={faq.answer} />
            ))}
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);

const FAQItem: React.FC<FaqEntry> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <motion.div
      animate={isOpen ? "open" : "closed"}
      className={cn(
        "rounded-xl border transition-colors",
        isOpen
          ? "border-accent-500/30 bg-accent-500/[0.04] dark:border-accent-500/40 dark:bg-accent-500/[0.08]"
          : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]",
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <span
          className={cn(
            "text-lg font-medium transition-colors",
            isOpen
              ? "text-slate-900 dark:text-white"
              : "text-slate-600 dark:text-white/60",
          )}
        >
          {question}
        </span>
        <motion.span
          variants={{ open: { rotate: "45deg" }, closed: { rotate: "0deg" } }}
          transition={{ duration: 0.2 }}
        >
          <Plus
            className={cn(
              "h-5 w-5 transition-colors",
              isOpen ? "text-accent-600 dark:text-accent-300" : "text-slate-400 dark:text-white/40",
            )}
          />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : "0px", marginBottom: isOpen ? "16px" : "0px" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="overflow-hidden px-4"
      >
        <p className="text-slate-600 dark:text-white/70">{answer}</p>
      </motion.div>
    </motion.div>
  );
};

// --- Real MariMail content -------------------------------------------------

const categories: FaqCategories = {
  platform: "Platform & Features",
  grow: "How we help you grow",
  sending: "Deliverability & Sending",
  data: "Data & Security",
  company: "Plans & Company",
};

const faqData: FaqData = {
  platform: [
    {
      question: "What is MariMail?",
      answer:
        "MariMail is AI-powered marine outreach. It combines vessel intelligence (IMO, port, ETA, cargo, owner/manager data) with a full email engine so marine service providers reach the right ships, superintendents, and procurement teams at the right port and the right time.",
    },
    {
      question: "What is Port Radar?",
      answer:
        "Port Radar is your live board of upcoming arrivals — every vessel heading to your target ports, sorted by ETA, with campaign status, contacts, and voyage context in one view. It's the fastest way to see who's arriving this week and who still has no outreach assigned.",
    },
    {
      question: "Can campaigns trigger automatically from vessel ETAs?",
      answer:
        "Yes. Build outreach around port arrivals, ETA windows, cargo changes, vessel attributes, and saved smart lists, then schedule each sequence step at a precise offset — e.g. 'send 1 day before ETA'. New matching vessels flow into a running campaign automatically.",
    },
    {
      question: "Where does the vessel and contact data come from?",
      answer:
        "MariMail blends your workspace data with a vessel DBMS (IMO records, owner/ISM/commercial managers, port intelligence) and a people search scoped to your vessels' companies — so you can qualify accounts and find the right decision-makers before you write a word.",
    },
    {
      question: "Do I need any technical setup to get going?",
      answer:
        "No. Connect a mailbox with one click, tell the AI which vessels or ports you're targeting in plain language, and MariMail handles the matching, scheduling, and sending. There's nothing to install and no servers to manage on your side.",
    },
  ],
  grow: [
    {
      question: "How does MariMail help my marine business grow?",
      answer:
        "Instead of cold-blasting a static list, you reach operators at the exact moment they need your service — as their vessel approaches your port. Timing that tightly to arrivals is what lifts reply rates and turns port calls into booked work for chandlers, hull cleaners, surveyors, agents, and bunker traders.",
    },
    {
      question: "Who is MariMail built for?",
      answer:
        "Marine service companies and shipping desks: ship chandlers, hull & hold cleaning, bunker traders, ship agents, surveyors, and brokerages — anyone whose revenue depends on catching vessels before or as they arrive at port.",
    },
    {
      question: "How is this better than a normal CRM or email tool?",
      answer:
        "Generic tools don't know a vessel's ETA, its owner, or when it's arriving at your port. MariMail is built around that marine context: it watches arrivals, matches them to the right companies and contacts, and paces sending so your outreach lands when it actually matters.",
    },
    {
      question: "Do I need a big list to get value?",
      answer:
        "No. Start with the vessels arriving at your ports this week. Port Radar surfaces them, the role search finds the people at their owner/manager companies, and campaigns handle the follow-up — you grow from live arrivals, not a stale spreadsheet.",
    },
    {
      question: "How quickly can I see results?",
      answer:
        "As soon as vessels are arriving at your target ports. Connect an inbox, pick your ports, and MariMail surfaces this week's arrivals with the right contacts — your first timed outreach can go out the same day, and replies start landing in your own inbox.",
    },
  ],
  sending: [
    {
      question: "How does MariMail protect deliverability?",
      answer:
        "Sends go through your own connected inboxes with volume rotated across accounts, randomized send gaps between messages, daily caps per inbox, warmup, and DNS (SPF/DKIM/DMARC) health checks. Bounce and reply signals feed suppression rules so campaigns scale without reckless blasting.",
    },
    {
      question: "Do I use my own Gmail / Outlook / SMTP accounts?",
      answer:
        "Yes. MariMail supports Gmail, Outlook, and standard IMAP/SMTP sending, so mail leaves from infrastructure you control — replies land in your own inbox and messages appear in your Sent folder, not a shared third-party pool.",
    },
    {
      question: "Can I control the pace and timing of sends?",
      answer:
        "Every campaign has a send window (days + hours in your timezone), a per-campaign gap between emails, and a per-inbox cooldown. Together they space your outreach out to look natural and protect sender reputation, even across multiple inboxes.",
    },
    {
      question: "What happens to contacts I add mid-campaign?",
      answer:
        "For live campaigns, newly added contacts are enrolled and scheduled on the same sequence automatically — they don't get missed, and they still respect your send window, gaps, and daily limits.",
    },
    {
      question: "Do you rotate across multiple inboxes safely?",
      answer:
        "Yes. Volume is spread across every connected mailbox, each with its own daily cap and cooldown, and a campaign-level gap sits on top so two sends never fire at the same instant. That keeps per-inbox reputation healthy while you scale total volume.",
    },
  ],
  data: [
    {
      question: "How is our outreach data secured?",
      answer:
        "Workspace access is permissioned, sending credentials stay encrypted and tied to your own accounts, and every campaign send is logged so teams can audit exactly who contacted which vessel or operator.",
    },
    {
      question: "Is my inbox and contact data shared with other users?",
      answer:
        "No. Your inboxes, contacts, campaigns, and vessel lists are scoped to your workspace. Sending happens from your accounts, and your data isn't pooled with other customers.",
    },
    {
      question: "Do you support roles and single sign-on?",
      answer:
        "Role-based access is available so teammates get the right permissions, and SSO is available on the Fleet plan for larger brokerages and shipping desks.",
    },
    {
      question: "Do you honour unsubscribes and compliance rules?",
      answer:
        "Yes. Unsubscribes are auto-suppressed across your whole workspace, hard bounces are removed from future sends, and every contact carries an audit trail — so your outreach stays permission-based and compliant as it scales.",
    },
  ],
  company: [
    {
      question: "How does the trial work?",
      answer:
        "Every new workspace starts with 500 trial tokens to spend over 14 days, with no credit card up front. Tokens are what you spend to reveal contact details — so you can search vessels, use Port Radar, connect an inbox and run a real campaign end to end before deciding. When the 14 days are up, or the tokens run out, you pick a plan to carry on.",
    },
    {
      question: "What plans are available?",
      answer:
        "Starter for solo operators, Pro for the full ETA engine with multi-inbox rotation and Port Radar, and Fleet for brokerages needing unlimited scale, SSO, a dedicated tenant, and an SLA. See the pricing section for the details.",
    },
    {
      question: "What support do I get?",
      answer:
        "Starter includes email support, Pro adds priority help for campaign setup and deliverability, and Fleet includes a dedicated onboarding engineer for larger teams.",
    },
    {
      question: "How do I get started?",
      answer:
        "Book a demo or start free from the top of the page. Connect an inbox, pick your target ports, and MariMail starts surfacing the vessels arriving that you can reach today.",
    },
    {
      question: "Can I upgrade, downgrade, or cancel anytime?",
      answer:
        "Yes. Plans are flexible — move between Starter, Pro, and Fleet as your needs change, with no long-term lock-in. During early access everything is free, so you can explore the full platform before choosing a plan.",
    },
  ],
};

/**
 * Drop-in FAQ section for the marketing page — pre-wired with real MariMail
 * categories and content. Marketing.tsx renders this at #faqs.
 */
export function FaqTabs() {
  return (
    <section id="faqs" className="relative scroll-mt-24">
      <FAQ
        title="Questions before you come aboard?"
        subtitle="Everything marine teams ask us"
        categories={categories}
        faqData={faqData}
      />
    </section>
  );
}

export default FaqTabs;
