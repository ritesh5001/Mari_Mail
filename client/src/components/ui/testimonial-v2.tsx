"use client";

import React from "react";
import { motion } from "framer-motion";

interface Testimonial {
  text: string;
  image: string;
  name: string;
  role: string;
}

const testimonials: Testimonial[] = [
  {
    text: "MariMail pings me the moment a bulker is a week from our port. My chartering pitches now land before competitors even know the vessel is inbound.",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Aksel Vinter",
    role: "Chartering Manager, Nordic Bulk",
  },
  {
    text: "The ETA-triggered sequences replaced a spreadsheet and three interns. Reply rates from captains and technical superintendents doubled in a quarter.",
    image:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Priya Menon",
    role: "Head of Growth, Portside Marine",
  },
  {
    text: "Inbox rotation and warm-up kept our sender reputation clean even as we scaled outreach 10x. Zero delivery incidents in six months.",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Diego Alvarez",
    role: "Ship Broker, MedShip Agencies",
  },
  {
    text: "Finally a CRM built for marine sales. The vessel DBMS, port radar and personalization tokens make every email feel researched, not blasted.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Farhan Siddiqui",
    role: "Commercial Director, Gulf Marine Supplies",
  },
  {
    text: "Our port agents used to guess who to contact. MariMail surfaces the right decision-maker per fleet in seconds and drafts the opener for them.",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Isabelle Laurent",
    role: "Port Agency Lead, Havre Maritime",
  },
  {
    text: "The AI-drafted openers actually sound like a broker wrote them — not a bot. Captains reply, which used to be the hardest part of the job.",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Sana Sheikh",
    role: "Sales Lead, Karachi Ship Services",
  },
  {
    text: "We booked eight new bunker contracts in the first quarter after switching. The ETA-driven cadence is a genuine unfair advantage.",
    image:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Hassan Ali",
    role: "Bunker Trader, Emerald Fuels",
  },
  {
    text: "Onboarding took an afternoon. Connecting inboxes, importing our fleet lists and shipping our first campaign happened the same day.",
    image:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Zainab Hussain",
    role: "Ops Manager, BlueWave Marine",
  },
  {
    text: "Reply tracking finally gives us a real pipeline view instead of scrolling through inboxes. Forecasting charter volume is a real thing now.",
    image:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=200&h=200",
    name: "Aliza Khan",
    role: "Revenue Analyst, Trident Chartering",
  },
];

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

const TestimonialsColumn = (props: {
  className?: string;
  testimonials: Testimonial[];
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.ul
        animate={{ translateY: "-50%" }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="m-0 flex list-none flex-col gap-6 bg-transparent p-0 pb-6"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <motion.li
                  key={`${index}-${i}`}
                  aria-hidden={index === 1 ? "true" : "false"}
                  tabIndex={index === 1 ? -1 : 0}
                  whileHover={{
                    scale: 1.03,
                    y: -8,
                    transition: { type: "spring", stiffness: 400, damping: 17 },
                  }}
                  whileFocus={{
                    scale: 1.03,
                    y: -8,
                    transition: { type: "spring", stiffness: 400, damping: 17 },
                  }}
                  className="premium-card group w-full max-w-xs cursor-default select-none rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-shell transition-all duration-300 hover:border-accent-500/40 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-accent-500/40"
                >
                  <blockquote className="m-0 p-0">
                    <p className="m-0 font-serif text-lg italic leading-relaxed text-white/70">
                      &ldquo;{text}&rdquo;
                    </p>
                    <footer className="mt-6 flex items-center gap-3">
                      <img
                        width={40}
                        height={40}
                        src={image}
                        alt={`Portrait of ${name}`}
                        loading="lazy"
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10 transition-all duration-300 ease-in-out group-hover:ring-accent-500/40"
                      />
                      <div className="flex flex-col">
                        <cite className="text-[15px] font-semibold not-italic leading-5 tracking-tight text-white">
                          {name}
                        </cite>
                        <span className="mt-0.5 text-sm leading-5 tracking-tight text-white/45">
                          {role}
                        </span>
                      </div>
                    </footer>
                  </blockquote>
                </motion.li>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.ul>
    </div>
  );
};

export function Testimonials() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="relative overflow-hidden bg-black py-24 lg:py-32"
    >
      <div
        className="absolute inset-0 starfield animate-star-pulse opacity-20"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto w-full max-w-6xl px-6"
      >
        <div className="mx-auto mb-14 flex max-w-[600px] flex-col items-center justify-center text-center">
          <div className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            Testimonials
          </div>

          <h2
            id="testimonials-heading"
            className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl"
          >
            Trusted across the <span className="violet-accent">marine</span> desk
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/55">
            Brokers, chartering managers and port agents ship campaigns that
            actually reach the bridge.
          </p>
        </div>

        <div
          className="flex max-h-[740px] justify-center gap-6 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]"
          role="region"
          aria-label="Scrolling testimonials"
        >
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn
            testimonials={secondColumn}
            className="hidden md:block"
            duration={19}
          />
          <TestimonialsColumn
            testimonials={thirdColumn}
            className="hidden lg:block"
            duration={17}
          />
        </div>
      </motion.div>
    </section>
  );
}

export default Testimonials;
