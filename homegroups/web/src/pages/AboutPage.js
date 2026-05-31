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

const SectionContainer = styled.section`
  padding: 5rem 1rem;
  background-color: ${(props) =>
    props.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const SectionContent = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  margin-bottom: 2rem;
  color: var(--text-dark);
  text-align: center;

  @media (max-width: 768px) {
    font-size: 1.75rem;
  }
`;

const StoryContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4rem;
  margin-bottom: 4rem;

  @media (max-width: 992px) {
    flex-direction: column;
    gap: 2rem;
  }
`;

const StoryContent = styled.div`
  flex: 1;
`;

const StoryImageContainer = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
`;

const StoryImage = styled.div`
  width: 100%;
  max-width: 450px;
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

const Paragraph = styled.p`
  font-size: 1.125rem;
  color: var(--text-light);
  margin-bottom: 1.5rem;
  line-height: 1.8;
`;

const ValueContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;

  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ValueCard = styled(motion.div)`
  background-color: white;
  border-radius: 0.5rem;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  text-align: center;
`;

const ValueIcon = styled.div`
  font-size: 3rem;
  margin-bottom: 1.5rem;
  color: var(--primary-color);
`;

const ValueTitle = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-dark);
`;

const ValueDescription = styled.p`
  color: var(--text-light);
  line-height: 1.6;
`;

const TeamContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3rem;
  justify-content: center;

  @media (max-width: 992px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const TeamMember = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
`;

const TeamMemberImage = styled.div`
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background-color: var(--primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  font-size: 4rem;
  margin-bottom: 1.5rem;
`;

const TeamMemberName = styled.h3`
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-dark);
`;

const TeamMemberRole = styled.p`
  font-size: 1rem;
  color: var(--primary-color);
  font-weight: 500;
  margin-bottom: 1rem;
`;

const TeamMemberBio = styled.p`
  color: var(--text-light);
  line-height: 1.6;
`;

const TimelineContainer = styled.div`
  position: relative;
  max-width: 800px;
  margin: 0 auto;

  &:before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 4px;
    background-color: var(--primary-light);
    transform: translateX(-50%);

    @media (max-width: 768px) {
      left: 30px;
    }
  }
`;

const TimelineItem = styled(motion.div)`
  position: relative;
  margin-bottom: 3rem;

  &:last-child {
    margin-bottom: 0;
  }

  &:nth-child(odd) {
    padding-right: calc(50% + 2rem);

    @media (max-width: 768px) {
      padding-right: 0;
      padding-left: 70px;
    }
  }

  &:nth-child(even) {
    padding-left: calc(50% + 2rem);

    @media (max-width: 768px) {
      padding-left: 70px;
    }
  }
`;

const TimelineDot = styled.div`
  position: absolute;
  width: 24px;
  height: 24px;
  background-color: var(--primary-color);
  border-radius: 50%;
  top: 0;

  ${(props) =>
    props.right
      ? `
    right: calc(50% - 12px);
    
    @media (max-width: 768px) {
      right: auto;
      left: 18px;
    }
  `
      : `
    left: calc(50% - 12px);
    
    @media (max-width: 768px) {
      left: 18px;
    }
  `}
`;

const TimelineContent = styled.div`
  background-color: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
`;

const TimelineYear = styled.div`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
`;

const TimelineTitle = styled.h3`
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
  color: var(--text-dark);
`;

const TimelineDescription = styled.p`
  font-size: 0.95rem;
  color: var(--text-light);
  line-height: 1.6;
`;

const AboutPage = () => {
  const { ref: storyRef, inView: storyInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: valuesRef, inView: valuesInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: teamRef, inView: teamInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const { ref: timelineRef, inView: timelineInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const fadeInUpVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const valueItems = [
    {
      icon: "🤝",
      title: "Respect for Traditions",
      description:
        "We build technology that respects and upholds the 12 Traditions, particularly around anonymity and group autonomy.",
    },
    {
      icon: "🔒",
      title: "Privacy First",
      description:
        "We never compromise on privacy. All features are designed with privacy as the foundation, not an afterthought.",
    },
    {
      icon: "💡",
      title: "Simplicity",
      description:
        "We believe in simplicity of design and function. Recovery tools should make life easier, not more complicated.",
    },
    {
      icon: "🌱",
      title: "Service",
      description:
        "Our work is built on a foundation of service to the recovery community. We are here to help, not to profit.",
    },
    {
      icon: "🔄",
      title: "Continuous Improvement",
      description:
        "We continuously seek user feedback to improve and evolve our platform to better serve recovery communities.",
    },
    {
      icon: "♿",
      title: "Accessibility",
      description:
        "We believe recovery tools should be accessible to everyone, regardless of technical ability or disability.",
    },
  ];

  const teamMembers = [
    {
      initial: "M",
      name: "Marcus",
      role: "Founder",
      bio: "A software developer with over a decade of experience and a member of the recovery community. Built Homegroups after seeing firsthand how much time homegroup treasurers and secretaries spend on paper records and disorganized handoffs.",
    },
  ];

  const timelineEvents = [
    {
      year: "2019",
      title: "The Idea Is Born",
      description:
        "After struggling with paper records and disorganized communication as a homegroup treasurer, the founder envisions a privacy-first digital solution for recovery groups.",
    },
    {
      year: "2020",
      title: "Research & Development",
      description:
        "Interviews with homegroup members across multiple fellowships surface a consistent set of pain points: treasury handoffs, meeting scheduling, and communication.",
    },
    {
      year: "2021",
      title: "First Prototype",
      description:
        "The first version of Homegroups is built and tested with pilot groups, focusing on meeting management and treasury tracking.",
    },
    {
      year: "2022",
      title: "Official Launch",
      description:
        "Homegroups launches publicly with its core feature set for group secretaries, treasurers, and members.",
    },
    {
      year: "2024",
      title: "Platform Expansion",
      description:
        "Advanced features added: governance tools, group analytics, intergroup support, and treatment center integrations.",
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Our Story</PageTitle>
          <PageSubtitle>
            Homegroups was built by members of the recovery community to solve
            real problems while respecting recovery traditions.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <SectionContainer>
        <SectionContent>
          <StoryContainer
            ref={storyRef}
            as={motion.div}
            initial={{ opacity: 0, y: 30 }}
            animate={storyInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.6 }}
          >
            <StoryContent>
              <SectionTitle style={{ textAlign: "left" }}>
                From Challenge to Solution
              </SectionTitle>
              <Paragraph>
                Homegroups began with a simple problem: as a treasurer for a
                homegroup, the founder was frustrated with the disorganized
                system of paper records, email chains, and text messages used
                to manage the group.
              </Paragraph>
              <Paragraph>
                When taking on the treasurer role, the first task was inheriting
                a shoebox of receipts and a notebook with financial records.
                When the service term ended, training the next treasurer and
                ensuring a smooth handoff of records was an unnecessarily
                complex process.
              </Paragraph>
              <Paragraph>
                The founder realized that while there were many digital tools
                available for businesses, none were designed specifically for
                12-step recovery groups with their unique needs for anonymity,
                simplicity, and respect for traditions.
              </Paragraph>
              <Paragraph>
                Homegroups was created to bridge that gap, providing recovery
                groups with the digital tools they need while maintaining the
                principles and traditions that make these communities special.
              </Paragraph>
            </StoryContent>
            <StoryImageContainer>
              <StoryImage>📱</StoryImage>
            </StoryImageContainer>
          </StoryContainer>
        </SectionContent>
      </SectionContainer>

      <SectionContainer alternate>
        <SectionContent>
          <SectionTitle>Our Values</SectionTitle>
          <ValueContainer
            ref={valuesRef}
            as={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate={valuesInView ? "visible" : "hidden"}
          >
            {valueItems.map((value, index) => (
              <ValueCard key={index} variants={fadeInUpVariants}>
                <ValueIcon>{value.icon}</ValueIcon>
                <ValueTitle>{value.title}</ValueTitle>
                <ValueDescription>{value.description}</ValueDescription>
              </ValueCard>
            ))}
          </ValueContainer>
        </SectionContent>
      </SectionContainer>

      <SectionContainer>
        <SectionContent>
          <SectionTitle>The Founder</SectionTitle>
          <TeamContainer
            ref={teamRef}
            as={motion.div}
            variants={containerVariants}
            initial="hidden"
            animate={teamInView ? "visible" : "hidden"}
          >
            {teamMembers.map((member, index) => (
              <TeamMember key={index} variants={fadeInUpVariants}>
                <TeamMemberImage>{member.initial}</TeamMemberImage>
                <TeamMemberName>{member.name}</TeamMemberName>
                <TeamMemberRole>{member.role}</TeamMemberRole>
                <TeamMemberBio>{member.bio}</TeamMemberBio>
              </TeamMember>
            ))}
          </TeamContainer>
        </SectionContent>
      </SectionContainer>

      <SectionContainer alternate>
        <SectionContent>
          <SectionTitle>Our Journey</SectionTitle>
          <TimelineContainer ref={timelineRef} as={motion.div}>
            {timelineEvents.map((event, index) => (
              <TimelineItem
                key={index}
                as={motion.div}
                initial={{ opacity: 0, y: 20 }}
                animate={
                  timelineInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }
                }
                transition={{ delay: index * 0.2, duration: 0.5 }}
              >
                <TimelineDot right={index % 2 === 0} />
                <TimelineContent>
                  <TimelineYear>{event.year}</TimelineYear>
                  <TimelineTitle>{event.title}</TimelineTitle>
                  <TimelineDescription>{event.description}</TimelineDescription>
                </TimelineContent>
              </TimelineItem>
            ))}
          </TimelineContainer>
        </SectionContent>
      </SectionContainer>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default AboutPage;
