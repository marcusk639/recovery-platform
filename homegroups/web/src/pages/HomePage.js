import React from "react";
import styled from "styled-components";
import HeroSection from "../components/HeroSection";
import FeaturesSection from "../components/FeaturesSection";
import TestimonialsSection from "../components/TestimonialsSection";
import PricingSection from "../components/PricingSection";
import NewsletterSignup from "../components/NewsletterSignup";

const HomePageContainer = styled.div`
  padding-top: 70px; // Adjust based on header height
`;

const HomePage = () => {
  return (
    <HomePageContainer>
      {/* Awareness Stage */}
      <HeroSection />

      {/* Interest Stage */}
      <FeaturesSection />

      {/* Desire Stage */}
      <TestimonialsSection />

      {/* Action Stage */}
      <PricingSection />

      {/* Lead Generation */}
      <NewsletterSignup />
    </HomePageContainer>
  );
};

export default HomePage;
