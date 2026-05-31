import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import NewsletterSignup from "../components/NewsletterSignup";

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background-color: var(--primary-color);
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

const PrivacySection = styled.section`
  padding: 5rem 1rem;
  background-color: var(--background);
`;

const PrivacyContent = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const LastUpdated = styled.p`
  font-size: 0.95rem;
  color: var(--text-light);
  margin-bottom: 3rem;
  text-align: center;
`;

const SectionTitle = styled.h2`
  font-size: 1.75rem;
  margin-top: 3rem;
  margin-bottom: 1.5rem;
  color: var(--text-dark);
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e2e8f0;

  &:first-of-type {
    margin-top: 0;
  }
`;

const SubsectionTitle = styled.h3`
  font-size: 1.25rem;
  margin-top: 2rem;
  margin-bottom: 1rem;
  color: var(--text-dark);
`;

const Paragraph = styled.p`
  font-size: 1rem;
  color: var(--text-light);
  margin-bottom: 1.5rem;
  line-height: 1.7;
`;

const BulletList = styled.ul`
  margin-bottom: 1.5rem;
  padding-left: 2rem;
`;

const ListItem = styled.li`
  font-size: 1rem;
  color: var(--text-light);
  margin-bottom: 0.75rem;
  line-height: 1.7;
`;

const ContactInfo = styled.div`
  background-color: var(--background-alt);
  padding: 2rem;
  border-radius: 0.5rem;
  margin: 3rem 0;
`;

const ContactTitle = styled.h3`
  font-size: 1.25rem;
  margin-bottom: 1rem;
  color: var(--text-dark);
`;

const ContactParagraph = styled.p`
  font-size: 1rem;
  color: var(--text-light);
  margin-bottom: 0.75rem;
  line-height: 1.7;
`;

const PrivacyHighlight = styled.div`
  background-color: rgba(90, 103, 216, 0.1);
  border-left: 4px solid var(--primary-color);
  padding: 1.5rem;
  border-radius: 0.25rem;
  margin: 2rem 0;
`;

const HighlightTitle = styled.h4`
  font-size: 1.125rem;
  margin-bottom: 0.75rem;
  color: var(--text-dark);
`;

const StyledLink = styled(Link)`
  color: var(--primary-color);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const ExternalLink = styled.a`
  color: var(--primary-color);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const Emphasis = styled.span`
  font-weight: 600;
`;

const PrivacyPage = () => {
  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Privacy Policy</PageTitle>
          <PageSubtitle>
            Your privacy is our top priority. Learn how we protect your
            information.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <PrivacySection>
        <PrivacyContent>
          <LastUpdated>Last Updated: May 27, 2026</LastUpdated>

          <PrivacyHighlight>
            <HighlightTitle>Our Privacy Commitment</HighlightTitle>
            <Paragraph style={{ marginBottom: 0 }}>
              Homegroups was built with privacy as a foundational principle. We
              understand the sensitive nature of recovery information and the
              importance of anonymity in 12-step programs. Our privacy practices
              are designed to respect and protect these principles.
            </Paragraph>
          </PrivacyHighlight>

          <Paragraph>
            This Privacy Policy describes how Homegroups ("we", "our", or "us")
            collects, uses, and discloses your information when you use our
            mobile application and website (collectively, the "Service").
          </Paragraph>

          <Paragraph>
            By using the Service, you agree to the collection and use of
            information in accordance with this policy. Unless otherwise defined
            in this Privacy Policy, terms used in this Privacy Policy have the
            same meanings as in our{" "}
            <StyledLink to="/terms">Terms of Service</StyledLink>.
          </Paragraph>

          <SectionTitle>1. Information We Collect</SectionTitle>

          <SubsectionTitle>Personal Information</SubsectionTitle>
          <Paragraph>
            When you use our Service, we may ask you to provide certain
            personally identifiable information that can be used to contact or
            identify you. This may include, but is not limited to:
          </Paragraph>
          <BulletList>
            <ListItem>Email address (for account authentication)</ListItem>
            <ListItem>
              First name or initial only (to respect anonymity)
            </ListItem>
            <ListItem>Recovery date (optional)</ListItem>
            <ListItem>Group affiliations</ListItem>
          </BulletList>
          <Paragraph>
            <Emphasis>
              We never require your full name, address, phone number, or other
              identifying information beyond what is necessary to provide the
              Service.
            </Emphasis>
          </Paragraph>

          <SubsectionTitle>Usage Data</SubsectionTitle>
          <Paragraph>
            We may also collect information about how the Service is accessed
            and used ("Usage Data"). This Usage Data may include information
            such as your device's Internet Protocol address (e.g., IP address),
            browser type, browser version, the pages of our Service that you
            visit, the time and date of your visit, the time spent on those
            pages, unique device identifiers, and other diagnostic data.
          </Paragraph>

          <SubsectionTitle>Location Data</SubsectionTitle>
          <Paragraph>
            We may use and store information about your location if you give us
            permission to do so ("Location Data"). We use this data to provide
            features of our Service, such as finding nearby meetings, and to
            improve and customize our Service.
          </Paragraph>
          <Paragraph>
            You can enable or disable location services when you use our Service
            at any time through your device settings.
          </Paragraph>

          <SectionTitle>2. How We Use Your Information</SectionTitle>
          <Paragraph>We use the collected data for various purposes:</Paragraph>
          <BulletList>
            <ListItem>To provide and maintain our Service</ListItem>
            <ListItem>To notify you about changes to our Service</ListItem>
            <ListItem>
              To allow you to participate in interactive features of our Service
              when you choose to do so
            </ListItem>
            <ListItem>To provide customer support</ListItem>
            <ListItem>
              To gather analysis or valuable information so that we can improve
              our Service
            </ListItem>
            <ListItem>To monitor the usage of our Service</ListItem>
            <ListItem>
              To detect, prevent, and address technical issues
            </ListItem>
          </BulletList>

          <SectionTitle>3. Data Security</SectionTitle>
          <Paragraph>
            The security of your data is important to us but remember that no
            method of transmission over the Internet or method of electronic
            storage is 100% secure. While we strive to use commercially
            acceptable means to protect your Personal Information, we cannot
            guarantee its absolute security.
          </Paragraph>

          <PrivacyHighlight>
            <HighlightTitle>Secure Communications</HighlightTitle>
            <Paragraph style={{ marginBottom: 0 }}>
              All communications in Homegroups are transmitted using
              industry-standard TLS encryption. Your data is stored securely in
              Firebase's infrastructure with strict access controls. We
              implement security best practices to protect your information.
            </Paragraph>
          </PrivacyHighlight>

          <SectionTitle>4. Data Retention</SectionTitle>
          <Paragraph>
            We will retain your Personal Information only for as long as is
            necessary for the purposes set out in this Privacy Policy. We will
            retain and use your Personal Information to the extent necessary to
            comply with our legal obligations, resolve disputes, and enforce our
            legal agreements and policies.
          </Paragraph>
          <Paragraph>
            We will also retain Usage Data for internal analysis purposes. Usage
            Data is generally retained for a shorter period of time, except when
            this data is used to strengthen the security or to improve the
            functionality of our Service, or we are legally obligated to retain
            this data for longer periods.
          </Paragraph>

          <SectionTitle>5. Transfer of Data</SectionTitle>
          <Paragraph>
            Your information, including Personal Information, may be transferred
            to—and maintained on—computers located outside of your state,
            province, country, or other governmental jurisdiction where the data
            protection laws may differ from those of your jurisdiction.
          </Paragraph>
          <Paragraph>
            If you are located outside the United States and choose to provide
            information to us, please note that we transfer the data, including
            Personal Information, to the United States and process it there.
          </Paragraph>
          <Paragraph>
            Your consent to this Privacy Policy followed by your submission of
            such information represents your agreement to that transfer.
          </Paragraph>

          <SectionTitle>6. Disclosure of Data</SectionTitle>

          <SubsectionTitle>Legal Requirements</SubsectionTitle>
          <Paragraph>
            Homegroups may disclose your Personal Information in the good faith
            belief that such action is necessary to:
          </Paragraph>
          <BulletList>
            <ListItem>To comply with a legal obligation</ListItem>
            <ListItem>
              To protect and defend the rights or property of Homegroups
            </ListItem>
            <ListItem>
              To prevent or investigate possible wrongdoing in connection with
              the Service
            </ListItem>
            <ListItem>
              To protect the personal safety of users of the Service or the
              public
            </ListItem>
            <ListItem>To protect against legal liability</ListItem>
          </BulletList>

          <PrivacyHighlight>
            <HighlightTitle>We Do Not Sell Your Data</HighlightTitle>
            <Paragraph style={{ marginBottom: 0 }}>
              Homegroups does not sell, trade, or rent your personal
              identification information to others. We may share generic
              aggregated demographic information not linked to any personal
              identification information regarding visitors and users with our
              business partners and trusted affiliates for the purposes outlined
              above.
            </Paragraph>
          </PrivacyHighlight>

          <SectionTitle>7. Your Data Protection Rights</SectionTitle>
          <Paragraph>You have the right to:</Paragraph>
          <BulletList>
            <ListItem>
              <Emphasis>Access</Emphasis> - You can request copies of your
              personal data.
            </ListItem>
            <ListItem>
              <Emphasis>Rectification</Emphasis> - You can request that we
              correct any information you believe is inaccurate or complete
              information you believe is incomplete.
            </ListItem>
            <ListItem>
              <Emphasis>Erasure</Emphasis> - You can request that we erase your
              personal data, under certain conditions.
            </ListItem>
            <ListItem>
              <Emphasis>Restriction of processing</Emphasis> - You can request
              that we restrict the processing of your personal data, under
              certain conditions.
            </ListItem>
            <ListItem>
              <Emphasis>Object to processing</Emphasis> - You can object to our
              processing of your personal data, under certain conditions.
            </ListItem>
            <ListItem>
              <Emphasis>Data portability</Emphasis> - You can request that we
              transfer the data that we have collected to another organization,
              or directly to you, under certain conditions.
            </ListItem>
          </BulletList>

          <SectionTitle>8. Children's Privacy</SectionTitle>
          <Paragraph>
            Our Service does not address anyone under the age of 18
            ("Children"). We do not knowingly collect personally identifiable
            information from anyone under the age of 18. If you are a parent or
            guardian and you are aware that your Child has provided us with
            Personal Information, please contact us. If we become aware that we
            have collected Personal Information from Children without
            verification of parental consent, we take steps to remove that
            information from our servers.
          </Paragraph>

          <SectionTitle>9. Changes to This Privacy Policy</SectionTitle>
          <Paragraph>
            We may update our Privacy Policy from time to time. We will notify
            you of any changes by posting the new Privacy Policy on this page
            and updating the "Last Updated" date at the top of this Privacy
            Policy.
          </Paragraph>
          <Paragraph>
            You are advised to review this Privacy Policy periodically for any
            changes. Changes to this Privacy Policy are effective when they are
            posted on this page.
          </Paragraph>

          <SectionTitle>10. Third-Party Services</SectionTitle>
          <Paragraph>
            Our Service may contain links to other sites that are not operated
            by us. If you click on a third-party link, you will be directed to
            that third party's site. We strongly advise you to review the
            Privacy Policy of every site you visit.
          </Paragraph>
          <Paragraph>
            We have no control over and assume no responsibility for the
            content, privacy policies, or practices of any third-party sites or
            services.
          </Paragraph>

          <SectionTitle>11. Analytics</SectionTitle>
          <Paragraph>
            We may use third-party Service Providers to monitor and analyze the
            use of our Service.
          </Paragraph>
          <Paragraph>
            These analytics services collect only anonymized data that cannot be
            traced back to individual users. We use this information solely to
            improve the functionality and user experience of our Service.
          </Paragraph>

          <SectionTitle>12. Contact Us</SectionTitle>
          <Paragraph>
            If you have any questions about this Privacy Policy, please contact
            us:
          </Paragraph>

          <ContactInfo>
            <ContactParagraph>
              <Emphasis>By Email:</Emphasis> admin@regroup-app.com
            </ContactParagraph>
            <ContactParagraph>
              <Emphasis>By Mail:</Emphasis> Homegroups
              <br />
              1150 Ryan St
              <br />
              Lake Charles, LA 70601
              <br />
              United States
            </ContactParagraph>
          </ContactInfo>

          <Paragraph>
            We take your privacy seriously and are committed to responding to
            your concerns promptly and effectively.
          </Paragraph>
        </PrivacyContent>
      </PrivacySection>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default PrivacyPage;
