import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const SectionContainer = styled.section`
  padding: 6rem 1rem;
  background-color: var(--background-alt);
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

const TestimonialsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const TestimonialCard = styled(motion.div)`
  background-color: white;
  border-radius: 0.5rem;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
`;

const TestimonialText = styled.blockquote`
  font-size: 1.125rem;
  color: var(--text-dark);
  line-height: 1.7;
  margin-bottom: 1.5rem;
  flex-grow: 1;
  position: relative;

  &::before,
  &::after {
    content: '"';
    font-size: 2.5rem;
    color: var(--primary-light);
    position: absolute;
    line-height: 1;
  }

  &::before {
    top: -1rem;
    left: -0.5rem;
  }

  &::after {
    content: '"';
    bottom: -2rem;
    right: -0.5rem;
  }
`;

const TestimonialAuthor = styled.div`
  display: flex;
  align-items: center;
  margin-top: auto;
`;

const AuthorInfo = styled.div`
  margin-left: 1rem;
`;

const AuthorName = styled.h4`
  font-size: 1.125rem;
  color: var(--text-dark);
  margin-bottom: 0.25rem;
`;

const AuthorTitle = styled.p`
  font-size: 0.875rem;
  color: var(--text-light);
`;

const AuthorAvatar = styled.div`
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background-color: var(--primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  font-weight: 600;
  font-size: 1.25rem;
`;

const ProblemSolutionBox = styled.div`
  background: linear-gradient(
    to right,
    var(--primary-dark),
    var(--primary-color)
  );
  border-radius: 0.5rem;
  padding: 3rem;
  color: white;
  max-width: 1200px;
  margin: 4rem auto 0;
`;

const ProblemSolutionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ProblemSolutionColumn = styled.div``;

const ProblemSolutionTitle = styled.h3`
  font-size: 1.75rem;
  margin-bottom: 1.5rem;
  font-weight: 600;
`;

const ProblemSolutionList = styled.ul`
  list-style-type: none;
  padding: 0;
`;

const ProblemSolutionItem = styled.li`
  margin-bottom: 1rem;
  display: flex;
  align-items: flex-start;

  &:before {
    content: ${(props) => (props.isProblem ? '"❌"' : '"✅"')};
    margin-right: 0.75rem;
    font-size: 1.125rem;
  }
`;

const testimonials = [
  {
    text: "Homegroups has completely transformed how our group manages meetings and treasury. The app makes it easy to track our 7th Tradition and stay connected without compromising anonymity.",
    name: "James T.",
    title: "Group Secretary, 5 years",
    initial: "J",
  },
  {
    text: "As a treasurer, I used to stress about keeping track of group finances and worried about the handoff when my service term ended. This app has eliminated those concerns completely.",
    name: "Sarah M.",
    title: "Group Treasurer, 3 years",
    initial: "S",
  },
  {
    text: "The meeting finder has been a lifesaver during my travels. Being able to find nearby meetings and have all the details saved offline has been incredibly helpful to maintaining my recovery.",
    name: "Michael H.",
    title: "Recovery Group Member, 7 years",
    initial: "M",
  },
  {
    text: "We needed a way for members to stay connected without using social media. Homegroups respects our traditions while giving us the tools we need to communicate effectively.",
    name: "Lisa P.",
    title: "Group Administrator, 4 years",
    initial: "L",
  },
];

const problems = [
  "Disorganized meeting info spread across emails, texts, and social media",
  "Treasury records lost during treasurer transitions",
  "Communications that compromise anonymity",
  "Inability to track group finances properly",
  "Difficult to manage prudent reserve funds",
];

const solutions = [
  "Centralized meeting management with offline access",
  "Seamless treasurer transitions with complete history",
  "Privacy-first communication respecting anonymity",
  "Simple treasury tracking with categorized expenses",
  "Automated prudent reserve monitoring and reporting",
];

const TestimonialsSection = () => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const { ref: problemRef, inView: problemInView } = useInView({
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

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <SectionContainer>
      <SectionHeader>
        <SectionTitle>What Recovery Groups Are Saying</SectionTitle>
        <SectionSubtitle>
          Groups like yours are using Homegroups to simplify operations and
          strengthen their recovery communities.
        </SectionSubtitle>
      </SectionHeader>

      <TestimonialsGrid
        ref={ref}
        as={motion.div}
        variants={containerVariants}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
      >
        {testimonials.map((testimonial, index) => (
          <TestimonialCard key={index} variants={itemVariants}>
            <TestimonialText>{testimonial.text}</TestimonialText>
            <TestimonialAuthor>
              <AuthorAvatar>{testimonial.initial}</AuthorAvatar>
              <AuthorInfo>
                <AuthorName>{testimonial.name}</AuthorName>
                <AuthorTitle>{testimonial.title}</AuthorTitle>
              </AuthorInfo>
            </TestimonialAuthor>
          </TestimonialCard>
        ))}
      </TestimonialsGrid>

      <ProblemSolutionBox
        ref={problemRef}
        as={motion.div}
        initial={{ opacity: 0, y: 30 }}
        animate={problemInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6 }}
      >
        <ProblemSolutionGrid>
          <ProblemSolutionColumn>
            <ProblemSolutionTitle>Problems We Solve</ProblemSolutionTitle>
            <ProblemSolutionList>
              {problems.map((problem, index) => (
                <ProblemSolutionItem key={index} isProblem>
                  {problem}
                </ProblemSolutionItem>
              ))}
            </ProblemSolutionList>
          </ProblemSolutionColumn>

          <ProblemSolutionColumn>
            <ProblemSolutionTitle>Our Solutions</ProblemSolutionTitle>
            <ProblemSolutionList>
              {solutions.map((solution, index) => (
                <ProblemSolutionItem key={index}>
                  {solution}
                </ProblemSolutionItem>
              ))}
            </ProblemSolutionList>
          </ProblemSolutionColumn>
        </ProblemSolutionGrid>
      </ProblemSolutionBox>
    </SectionContainer>
  );
};

export default TestimonialsSection;
