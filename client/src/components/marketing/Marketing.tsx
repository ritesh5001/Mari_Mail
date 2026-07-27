import { HeroSection } from "@/components/ui/hero-section-1";
import { StatsStrip } from "./StatsStrip";
import { PainPoints } from "./PainPoints";
import { Pillars } from "./Pillars";
import { HowItWorks } from "./HowItWorks";
import { Integrations } from "./Integrations";
import { PricingCard } from "@/components/ui/pricing-card";
import { FaqTabs } from "@/components/ui/faq-tabs";
import { FinalCta } from "./FinalCta";
import { MarketingFooter } from "./MarketingFooter";
import { Testimonials } from "@/components/ui/testimonial-v2";

export function Marketing() {
  return (
    <main
      data-marketing-root
      className="marketing-root relative min-h-screen overflow-x-clip bg-black text-white"
    >
      <HeroSection />
      <StatsStrip />
      <PainPoints />
      <Pillars />
      <HowItWorks />
      <Integrations />
      <PricingCard />
      <Testimonials />
      <FaqTabs />
      <FinalCta />
      <MarketingFooter />
    </main>
  );
}
