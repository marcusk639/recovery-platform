import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const SectionContainer = styled.section`
  padding: 6rem 1rem;
  background-color: var(--background);
`;

const SectionHeader = styled.div`
  text-align: center;
  max-width: 700px;
  margin: 0 auto 4rem;
`;

const SectionTitle = styled.h2`
  color: var(--text-dark);
  margin-bottom: 1rem;
  font-size: 2.5rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const SectionSubtitle = styled.p`
  color: var(--text-light);
  font-size: 1.25rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FeatureCard = styled(motion.div)`
  background-color: white;
  border-radius: 0.5rem;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-10px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  }
`;

const FeatureIcon = styled.div`
  font-size: 2.5rem;
  margin-bottom: 1.5rem;
  color: var(--primary-color);
`;

const FeatureTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-dark);
`;

const FeatureDescription = styled.p`
  color: var(--text-light);
  line-height: 1.6;
`;

const features = [
  {
    icon: "📅",
    title: "Meeting Management",
    description:
      "Find meetings near you, save your favorites, and access meeting details even when offline.",
  },
  {
    icon: "💬",
    title: "Group Communication",
    description:
      "Manage group announcements and directly message other members with secure TLS encryption.",
  },
  {
    icon: "💰",
    title: "Treasury Tracking",
    description:
      "Easily track income and expenses, generate reports, and handle treasurer transitions seamlessly.",
  },
  {
    icon: "🔒",
    title: "Privacy First",
    description:
      "Built with anonymity in mind. First-name only display options and secure TLS encrypted messages.",
  },
  {
    icon: "📱",
    title: "Offline Access",
    description:
      "View meeting details, member contact info, and important announcements even without internet.",
  },
  {
    icon: "🎉",
    title: "Celebration Notifications",
    description:
      "Never miss important sobriety milestones. Get notified of celebrations and group events.",
  },
];

const FeaturesSection = () => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <SectionContainer>
      <SectionHeader>
        <SectionTitle>Powerful Features for Recovery Groups</SectionTitle>
        <SectionSubtitle>
          Homegroups simplifies managing your homegroup's operations while
          preserving anonymity and group autonomy.
        </SectionSubtitle>
      </SectionHeader>

      <FeaturesGrid
        ref={ref}
        as={motion.div}
        variants={containerVariants}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
      >
        {features.map((feature, index) => (
          <FeatureCard key={index} variants={cardVariants}>
            <FeatureIcon>{feature.icon}</FeatureIcon>
            <FeatureTitle>{feature.title}</FeatureTitle>
            <FeatureDescription>{feature.description}</FeatureDescription>
          </FeatureCard>
        ))}
      </FeaturesGrid>
    </SectionContainer>
  );
};

export default FeaturesSection;
