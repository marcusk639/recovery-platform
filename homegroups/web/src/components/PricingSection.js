import React from "react";
import { Link } from "react-router-dom";
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

const PricingContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 992px) {
    flex-direction: column;
    align-items: center;
  }
`;

const PricingCard = styled(motion.div)`
  background-color: white;
  border-radius: 0.5rem;
  padding: 3rem 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  width: 100%;
  max-width: 350px;
  display: flex;
  flex-direction: column;
  border: ${(props) =>
    props.featured ? "2px solid var(--primary-color)" : "1px solid #e2e8f0"};
  position: relative;
  overflow: hidden;

  @media (max-width: 992px) {
    max-width: 500px;
  }
`;

const FeatureTag = styled.div`
  position: absolute;
  top: 1.5rem;
  right: -3rem;
  background-color: var(--primary-color);
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 3rem;
  transform: rotate(45deg);
`;

const PricingTitle = styled.h3`
  font-size: 1.5rem;
  color: var(--text-dark);
  margin-bottom: 1rem;
  font-weight: 700;
`;

const PricingPrice = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: 0.25rem;

  span {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-light);
  }
`;

const PricingDescription = styled.p`
  color: var(--text-light);
  margin-bottom: 2rem;
  font-size: 0.95rem;
`;

const PricingButton = styled(Link)`
  background-color: ${(props) =>
    props.primary ? "var(--primary-color)" : "transparent"};
  color: ${(props) => (props.primary ? "white" : "var(--primary-color)")};
  border: ${(props) =>
    props.primary ? "none" : "2px solid var(--primary-color)"};
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  font-weight: 600;
  text-align: center;
  transition: all 0.3s ease;
  margin-top: auto;

  &:hover {
    background-color: ${(props) =>
      props.primary ? "var(--primary-dark)" : "var(--primary-light)"};
    text-decoration: none;
  }
`;

const FeatureList = styled.ul`
  list-style-type: none;
  padding: 0;
  margin: 0 0 2rem;
  flex-grow: 1;
`;

const FeatureItem = styled.li`
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;

  &:before {
    content: "✓";
    margin-right: 0.75rem;
    color: var(--success);
    font-weight: bold;
  }
`;

const ActionContainer = styled.div`
  max-width: 800px;
  margin: 5rem auto 0;
  text-align: center;
`;

const ActionText = styled.p`
  font-size: 1.25rem;
  color: var(--text-dark);
  margin-bottom: 2rem;
`;

const ActionButtons = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;

  @media (max-width: 480px) {
    flex-direction: column;
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }
`;

const ActionButton = styled(Link)`
  background-color: ${(props) =>
    props.secondary ? "transparent" : "var(--primary-color)"};
  color: ${(props) => (props.secondary ? "var(--primary-color)" : "white")};
  border: ${(props) =>
    props.secondary ? "2px solid var(--primary-color)" : "none"};
  padding: 1rem 2rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 1.125rem;
  transition: all 0.3s ease;

  &:hover {
    background-color: ${(props) =>
      props.secondary ? "var(--primary-light)" : "var(--primary-dark)"};
    text-decoration: none;
  }

  @media (max-width: 480px) {
    display: block;
    width: 100%;
  }
`;

const PricingSection = () => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const { ref: actionRef, inView: actionInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
      },
    }),
  };

  return (
    <SectionContainer>
      <SectionHeader>
        <SectionTitle>Simple, Affordable Pricing</SectionTitle>
        <SectionSubtitle>
          Homegroups is designed to be accessible for all recovery groups, no
          matter their size.
        </SectionSubtitle>
      </SectionHeader>

      <PricingContainer ref={ref}>
        <PricingCard
          as={motion.div}
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >
          <PricingTitle>Free</PricingTitle>
          <PricingPrice>
            $0 <span>per month</span>
          </PricingPrice>
          <PricingDescription>
            For individuals seeking recovery meetings and basic group features.
          </PricingDescription>

          <FeatureList>
            <FeatureItem>Find and save meetings</FeatureItem>
            <FeatureItem>Personal meeting schedule</FeatureItem>
            <FeatureItem>View group announcements</FeatureItem>
            <FeatureItem>Basic member profiles</FeatureItem>
            <FeatureItem>Secure TLS encrypted messages</FeatureItem>
          </FeatureList>

          <PricingButton to="/contact">Get Started</PricingButton>
        </PricingCard>

        <PricingCard
          featured
          as={motion.div}
          custom={1}
          variants={cardVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >
          <FeatureTag>MOST POPULAR</FeatureTag>
          <PricingTitle>Premium</PricingTitle>
          <PricingPrice>
            $1 <span>per month</span>
          </PricingPrice>
          <PricingDescription>
            For recovery groups who need additional management features.
          </PricingDescription>

          <FeatureList>
            <FeatureItem>All Free features</FeatureItem>
            <FeatureItem>Complete treasury management</FeatureItem>
            <FeatureItem>Business meeting tools</FeatureItem>
            <FeatureItem>Financial reports</FeatureItem>
            <FeatureItem>Service commitment tracking</FeatureItem>
            <FeatureItem>Unlimited group members</FeatureItem>
            <FeatureItem>Celebration notifications</FeatureItem>
          </FeatureList>

          <PricingButton to="/contact" primary>
            Get Started
          </PricingButton>
        </PricingCard>
      </PricingContainer>

      <ActionContainer
        ref={actionRef}
        as={motion.div}
        initial={{ opacity: 0, y: 20 }}
        animate={actionInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        <ActionText>
          Ready to transform how your recovery group operates? Join thousands of
          recovery groups already using Homegroups.
        </ActionText>
        <ActionButtons>
          <ActionButton to="/contact">Start Free Trial</ActionButton>
          <ActionButton to="/demo" secondary>
            Schedule Demo
          </ActionButton>
        </ActionButtons>
      </ActionContainer>
    </SectionContainer>
  );
};

export default PricingSection;
