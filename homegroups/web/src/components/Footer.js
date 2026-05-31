import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

const FooterContainer = styled.footer`
  background-color: var(--background-alt);
  padding: 4rem 1rem 2rem;
  color: var(--text-light);
`;

const FooterContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const FooterColumn = styled.div`
  display: flex;
  flex-direction: column;
`;

const FooterHeading = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: var(--text-dark);
`;

const FooterLink = styled(Link)`
  margin-bottom: 0.75rem;
  color: var(--text-light);
  font-size: 0.95rem;

  &:hover {
    color: var(--primary-color);
  }
`;

const ExternalLink = styled.a`
  margin-bottom: 0.75rem;
  color: var(--text-light);
  font-size: 0.95rem;

  &:hover {
    color: var(--primary-color);
  }
`;

const Copyright = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
  padding-top: 2rem;
  margin-top: 2rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.875rem;
`;

const SocialLinks = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
`;

const SocialIcon = styled.a`
  font-size: 1.25rem;
  color: var(--text-light);

  &:hover {
    color: var(--primary-color);
  }
`;

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <FooterContainer>
      <FooterContent>
        <FooterColumn>
          <FooterHeading>Homegroups</FooterHeading>
          <p>
            A privacy-first app for 12-step recovery groups. Manage meetings,
            treasury, and communications with ease.
          </p>
          <SocialLinks>
            <SocialIcon
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              𝕏
            </SocialIcon>
            <SocialIcon
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              f
            </SocialIcon>
            <SocialIcon
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              📷
            </SocialIcon>
          </SocialLinks>
        </FooterColumn>

        <FooterColumn>
          <FooterHeading>Product</FooterHeading>
          <FooterLink to="/features">Features</FooterLink>
          <FooterLink to="/pricing">Pricing</FooterLink>
          <FooterLink to="/download">Download</FooterLink>
          <FooterLink to="/updates">Updates</FooterLink>
          <FooterLink to="/for-treatment-centers">
            For treatment centers
          </FooterLink>
          <FooterLink to="/for-intergroups">For intergroups</FooterLink>
        </FooterColumn>

        <FooterColumn>
          <FooterHeading>Company</FooterHeading>
          <FooterLink to="/about">About</FooterLink>
          <FooterLink to="/contact">Contact</FooterLink>
          <FooterLink to="/blog">Blog</FooterLink>
          <FooterLink to="/careers">Careers</FooterLink>
        </FooterColumn>

        <FooterColumn>
          <FooterHeading>Legal</FooterHeading>
          <FooterLink to="/terms">Terms of Service</FooterLink>
          <FooterLink to="/privacy">Privacy Policy</FooterLink>
          <FooterLink to="/cookies">Cookie Policy</FooterLink>
          <FooterLink to="/accessibility">Accessibility</FooterLink>
        </FooterColumn>
      </FooterContent>

      <Copyright>
        &copy; {currentYear} Homegroups. All rights reserved.
      </Copyright>
    </FooterContainer>
  );
};

export default Footer;
