import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { motion } from "framer-motion";

const HeroContainer = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 10rem 1rem 6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  overflow: hidden;
`;

const HeroContent = styled.div`
  max-width: 900px;
  margin: 0 auto;
  position: relative;
  z-index: 10;
`;

const HeroTitle = styled(motion.h1)`
  color: white;
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.25rem;
  max-width: 700px;
  margin: 0 auto 2.5rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const ButtonGroup = styled(motion.div)`
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

const PrimaryButton = styled(Link)`
  background-color: white;
  color: var(--primary-color);
  padding: 1rem 2rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 1.125rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 7px 14px rgba(0, 0, 0, 0.1);
    text-decoration: none;
  }

  @media (max-width: 480px) {
    display: block;
    width: 100%;
    text-align: center;
  }
`;

const SecondaryButton = styled(Link)`
  background-color: transparent;
  color: white;
  padding: 1rem 2rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 1.125rem;
  border: 2px solid white;
  transition: all 0.3s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    text-decoration: none;
  }

  @media (max-width: 480px) {
    display: block;
    width: 100%;
    text-align: center;
  }
`;

const BackgroundCircle = styled.div`
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.1);
  top: -200px;
  right: -200px;

  @media (max-width: 768px) {
    width: 400px;
    height: 400px;
  }
`;

const BackgroundCircle2 = styled.div`
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.1);
  bottom: -150px;
  left: -150px;

  @media (max-width: 768px) {
    width: 300px;
    height: 300px;
  }
`;

const HeroSection = () => {
  return (
    <HeroContainer>
      <BackgroundCircle />
      <BackgroundCircle2 />

      <HeroContent>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Privacy-First Group Management for 12-Step Recovery
        </HeroTitle>

        <HeroSubtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Homegroups simplifies meeting coordination, treasury management, and
          group communications while respecting the traditions of anonymity.
        </HeroSubtitle>

        <ButtonGroup
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <PrimaryButton to="/contact">Get Started</PrimaryButton>
          <SecondaryButton to="/features">Learn More</SecondaryButton>
        </ButtonGroup>
      </HeroContent>
    </HeroContainer>
  );
};

export default HeroSection;
