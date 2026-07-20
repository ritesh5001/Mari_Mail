import { MarketingNav } from "./MarketingNav";
import { Hero } from "./Hero";
import { StatsStrip } from "./StatsStrip";
import { PainPoints } from "./PainPoints";
import { Pillars } from "./Pillars";
import { HowItWorks } from "./HowItWorks";
import { Integrations } from "./Integrations";
import { Pricing } from "./Pricing";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { MarketingFooter } from "./MarketingFooter";

export function Marketing() {
  return (
    <main
      data-marketing-root
      className="marketing-root relative min-h-screen overflow-x-clip bg-black text-white"
    >
      <MarketingNav />
      <Hero />
      <StatsStrip />
      <PainPoints />
      <Pillars />
      <HowItWorks />
      <Integrations />
      <Pricing />
      <Faq />
      <FinalCta />
      <MarketingFooter />
    </main>
  );
}
