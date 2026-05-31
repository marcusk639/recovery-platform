import { HeroSection } from "@/components/home/HeroSection";
import { ServiceLadderPreview } from "@/components/home/ServiceLadderPreview";
import { TrustSignals } from "@/components/home/TrustSignals";

export default function Home() {
  return (
    <>
      <HeroSection />
      <TrustSignals />
      <ServiceLadderPreview />
    </>
  );
}
