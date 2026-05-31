import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import NewsletterSignup from "../components/NewsletterSignup";

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 6rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 3rem;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const FeatureSection = styled.section`
  padding: 5rem 1rem;
  background-color: ${(props) =>
    props.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const FeatureContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 4rem;

  @media (max-width: 992px) {
    flex-direction: ${(props) =>
      props.imageRight ? "column-reverse" : "column"};
    gap: 2rem;
  }
`;

const FeatureContent = styled.div`
  flex: 1;
`;

const FeatureImageContainer = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
`;

const FeatureImage = styled.div`
  width: 100%;
  max-width: 500px;
  height: 350px;
  background-color: var(--primary-light);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  font-size: 5rem;

  @media (max-width: 768px) {
    height: 250px;
  }
`;

const FeatureTitle = styled.h2`
  font-size: 2.25rem;
  color: var(--text-dark);
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 1.75rem;
  }
`;

const FeatureDescription = styled.p`
  font-size: 1.125rem;
  color: var(--text-light);
  margin-bottom: 1.5rem;
  line-height: 1.6;
`;

const FeatureList = styled.ul`
  list-style-type: none;
  padding: 0;
  margin: 0 0 1.5rem;
`;

const FeatureItem = styled.li`
  margin-bottom: 1rem;
  display: flex;
  align-items: flex-start;
  font-size: 1.125rem;

  &:before {
    content: "✓";
    margin-right: 0.75rem;
    color: var(--success);
    font-weight: bold;
  }
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 1200px;
  margin: 4rem auto 0;

  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FeatureCard = styled.div`
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

const CardIcon = styled.div`
  font-size: 2.5rem;
  margin-bottom: 1.5rem;
  color: var(--primary-color);
`;

const CardTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-dark);
`;

const CardDescription = styled.p`
  color: var(--text-light);
  line-height: 1.6;
`;

const FeaturesPage = () => {
  const { ref: ref1, inView: inView1 } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: ref2, inView: inView2 } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: ref3, inView: inView3 } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: ref4, inView: inView4 } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const animationProps = {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  const additionalFeatures = [
    {
      icon: "📊",
      title: "Group Analytics",
      description:
        "Track attendance trends, treasury history, and service rotation patterns with easy-to-read visual reports.",
    },
    {
      icon: "🔄",
      title: "Service Rotations",
      description:
        "Automate service position rotation reminders and track commitments for your group.",
    },
    {
      icon: "📋",
      title: "Business Meeting Tools",
      description:
        "Create agendas, track motions, and record business meeting minutes in one centralized place.",
    },
    {
      icon: "📋",
      title: "Literature References",
      description:
        "Access a comprehensive library of recovery literature references and readings for your meetings.",
    },
    {
      icon: "🔔",
      title: "Smart Notifications",
      description:
        "Receive customized notifications for meetings, service commitments, and group announcements.",
    },
    {
      icon: "📱",
      title: "Cross-Platform Sync",
      description:
        "Seamlessly sync your data across all your devices for access anywhere, anytime.",
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Features Designed for Recovery Groups</PageTitle>
          <PageSubtitle>
            Homegroups combines powerful functionality with privacy-first design
            to help 12-step groups operate more effectively while respecting
            recovery traditions.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      {/* Meeting Management Section */}
      <FeatureSection>
        <FeatureContainer
          ref={ref1}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <FeatureContent>
            <FeatureTitle>Meeting Management</FeatureTitle>
            <FeatureDescription>
              Finding and managing meetings has never been easier. Our
              comprehensive meeting tools help you stay connected to your
              recovery community wherever you are.
            </FeatureDescription>
            <FeatureList>
              <FeatureItem>
                Location-based meeting finder with filtering options
              </FeatureItem>
              <FeatureItem>Offline meeting list for travelers</FeatureItem>
              <FeatureItem>
                Personal meeting schedule with optional reminders
              </FeatureItem>
              <FeatureItem>
                Detailed meeting information including format and directions
              </FeatureItem>
              <FeatureItem>
                One-click access to join online meetings
              </FeatureItem>
            </FeatureList>
          </FeatureContent>
          <FeatureImageContainer>
            <FeatureImage>📅</FeatureImage>
          </FeatureImageContainer>
        </FeatureContainer>
      </FeatureSection>

      {/* Group Communication Section */}
      <FeatureSection alternate>
        <FeatureContainer
          imageRight
          ref={ref2}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <FeatureImageContainer>
            <FeatureImage>💬</FeatureImage>
          </FeatureImageContainer>
          <FeatureContent>
            <FeatureTitle>Group Communication</FeatureTitle>
            <FeatureDescription>
              Stay connected with your recovery community without compromising
              anonymity. Our communication tools are built with privacy in mind.
            </FeatureDescription>
            <FeatureList>
              <FeatureItem>Official group announcements channel</FeatureItem>
              <FeatureItem>Secure TLS encrypted direct messaging</FeatureItem>
              <FeatureItem>
                Privacy controls with first name or initial only display
              </FeatureItem>
              <FeatureItem>
                Celebration notifications for sobriety milestones
              </FeatureItem>
              <FeatureItem>
                Event coordination with RSVP functionality
              </FeatureItem>
            </FeatureList>
          </FeatureContent>
        </FeatureContainer>
      </FeatureSection>

      {/* Treasury Management Section */}
      <FeatureSection>
        <FeatureContainer
          ref={ref3}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <FeatureContent>
            <FeatureTitle>Treasury Management</FeatureTitle>
            <FeatureDescription>
              Simplify your group's financial tracking with our comprehensive
              treasury tools. Never lose track of 7th Tradition contributions
              again.
            </FeatureDescription>
            <FeatureList>
              <FeatureItem>Simple income and expense tracking</FeatureItem>
              <FeatureItem>7th Tradition record keeping</FeatureItem>
              <FeatureItem>Balance and prudent reserve monitoring</FeatureItem>
              <FeatureItem>Financial reports for business meetings</FeatureItem>
              <FeatureItem>
                Seamless treasurer transitions between service terms
              </FeatureItem>
            </FeatureList>
          </FeatureContent>
          <FeatureImageContainer>
            <FeatureImage>💰</FeatureImage>
          </FeatureImageContainer>
        </FeatureContainer>
      </FeatureSection>

      {/* Privacy & Security Section */}
      <FeatureSection alternate>
        <FeatureContainer
          imageRight
          ref={ref4}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          <FeatureImageContainer>
            <FeatureImage>🔒</FeatureImage>
          </FeatureImageContainer>
          <FeatureContent>
            <FeatureTitle>Privacy & Security</FeatureTitle>
            <FeatureDescription>
              We take anonymity and security seriously. Homegroups is built with
              privacy-first principles and rigorous security standards.
            </FeatureDescription>
            <FeatureList>
              <FeatureItem>
                TLS encryption for all communications
              </FeatureItem>
              <FeatureItem>
                First name or initial only display options
              </FeatureItem>
              <FeatureItem>No social media integration or sharing</FeatureItem>
              <FeatureItem>
                Granular privacy controls for all information
              </FeatureItem>
              <FeatureItem>
                Local data storage where possible for enhanced privacy
              </FeatureItem>
            </FeatureList>
          </FeatureContent>
        </FeatureContainer>
      </FeatureSection>

      {/* Additional Features Section */}
      <FeatureSection>
        <div
          style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
        >
          <FeatureTitle>Additional Features</FeatureTitle>
          <FeatureDescription>
            Homegroups continues to expand with new features requested by the
            recovery community.
          </FeatureDescription>
        </div>

        <FeaturesGrid>
          {additionalFeatures.map((feature, index) => (
            <FeatureCard key={index}>
              <CardIcon>{feature.icon}</CardIcon>
              <CardTitle>{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </FeatureCard>
          ))}
        </FeaturesGrid>
      </FeatureSection>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default FeaturesPage;
