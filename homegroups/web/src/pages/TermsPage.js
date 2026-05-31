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

const TermsSection = styled.section`
  padding: 5rem 1rem;
  background-color: var(--background);
`;

const TermsContent = styled.div`
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

const TermsPage = () => {
  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Terms of Service</PageTitle>
          <PageSubtitle>
            Please read these terms carefully before using Homegroups.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <TermsSection>
        <TermsContent>
          <LastUpdated>Last Updated: May 27, 2026</LastUpdated>

          <Paragraph>
            Welcome to Homegroups. The following Terms of Service ("Terms")
            govern your access to and use of the Homegroups mobile application
            and website ("Service"), including any content, functionality, and
            services offered on or through the application or website.
          </Paragraph>

          <Paragraph>
            By accessing or using the Service, you agree to be bound by these
            Terms. If you do not agree to these Terms, you may not access or use
            the Service.
          </Paragraph>

          <SectionTitle>1. Acceptance of Terms</SectionTitle>
          <Paragraph>
            By accessing or using the Service, you confirm that you accept these
            Terms and agree to comply with them. If you do not agree to these
            Terms, you must not access or use the Service.
          </Paragraph>

          <SectionTitle>2. Changes to Terms</SectionTitle>
          <Paragraph>
            We may revise these Terms at any time by updating this page. By
            continuing to access or use our Service after those revisions become
            effective, you agree to be bound by the revised Terms.
          </Paragraph>

          <SectionTitle>3. Privacy Policy</SectionTitle>
          <Paragraph>
            Your privacy is important to us. Our{" "}
            <StyledLink to="/privacy">Privacy Policy</StyledLink> explains how
            we collect, use, disclose, and safeguard your information when you
            use our Service. By using the Service, you consent to the
            collection, use, and disclosure of information in accordance with
            our Privacy Policy.
          </Paragraph>

          <SectionTitle>4. User Accounts</SectionTitle>
          <Paragraph>
            When you create an account with us, you must provide accurate,
            complete, and current information. Failure to do so constitutes a
            breach of the Terms, which may result in immediate termination of
            your account.
          </Paragraph>

          <Paragraph>
            You are responsible for safeguarding the password you use to access
            the Service and for any activities or actions under your password.
            We encourage you to use a "strong" password (a password that uses a
            combination of upper and lower case letters, numbers, and symbols)
            with your account.
          </Paragraph>

          <Paragraph>
            You agree not to disclose your password to any third party. You must
            notify us immediately upon becoming aware of any breach of security
            or unauthorized use of your account.
          </Paragraph>

          <SectionTitle>5. User Content</SectionTitle>
          <Paragraph>
            Our Service allows you to post, link, store, share, and otherwise
            make available certain information, text, graphics, photos, or other
            material ("Content"). By making Content available through the
            Service, you grant to Homegroups a non-exclusive, transferable,
            sub-licensable, royalty-free, worldwide license to use, copy,
            modify, create derivative works based on, distribute, publicly
            display, and otherwise use such Content to provide the Service.
          </Paragraph>

          <Paragraph>
            You represent and warrant that: (i) the Content is yours or you have
            the right to use it and grant us the rights and license as provided
            in these Terms, and (ii) the posting of your Content on or through
            the Service does not violate the privacy rights, publicity rights,
            copyrights, contract rights, or any other rights of any person.
          </Paragraph>

          <SectionTitle>6. Prohibited Uses</SectionTitle>
          <Paragraph>
            You may use the Service only for lawful purposes and in accordance
            with these Terms. You agree not to use the Service:
          </Paragraph>

          <BulletList>
            <ListItem>
              In any way that violates any applicable federal, state, local, or
              international law or regulation.
            </ListItem>
            <ListItem>
              To exploit, harm, or attempt to exploit or harm minors in any way.
            </ListItem>
            <ListItem>
              To transmit, or procure the sending of, any advertising or
              promotional material, including any "junk mail," "chain letter,"
              "spam," or any other similar solicitation.
            </ListItem>
            <ListItem>
              To impersonate or attempt to impersonate Homegroups, a Homegroups
              employee, another user, or any other person or entity.
            </ListItem>
            <ListItem>
              To engage in any other conduct that restricts or inhibits anyone's
              use or enjoyment of the Service, or which may harm Recovery
              Connect or users of the Service.
            </ListItem>
          </BulletList>

          <SectionTitle>7. Intellectual Property</SectionTitle>
          <Paragraph>
            The Service and its original content (excluding Content provided by
            users), features, and functionality are and will remain the
            exclusive property of Homegroups and its licensors. The Service is
            protected by copyright, trademark, and other laws of both the United
            States and foreign countries. Our trademarks and trade dress may not
            be used in connection with any product or service without the prior
            written consent of Homegroups.
          </Paragraph>

          <SectionTitle>8. Termination</SectionTitle>
          <Paragraph>
            We may terminate or suspend your account immediately, without prior
            notice or liability, for any reason whatsoever, including without
            limitation if you breach the Terms.
          </Paragraph>

          <Paragraph>
            Upon termination, your right to use the Service will immediately
            cease. If you wish to terminate your account, you may simply
            discontinue using the Service, or delete your account from within
            the application settings.
          </Paragraph>

          <SectionTitle>9. Limitation of Liability</SectionTitle>
          <Paragraph>
            In no event shall Homegroups, nor its directors, employees,
            partners, agents, suppliers, or affiliates, be liable for any
            indirect, incidental, special, consequential or punitive damages,
            including without limitation, loss of profits, data, use, goodwill,
            or other intangible losses, resulting from (i) your access to or use
            of or inability to access or use the Service; (ii) any conduct or
            content of any third party on the Service; (iii) any content
            obtained from the Service; and (iv) unauthorized access, use or
            alteration of your transmissions or content, whether based on
            warranty, contract, tort (including negligence) or any other legal
            theory, whether or not we have been informed of the possibility of
            such damage.
          </Paragraph>

          <SectionTitle>10. Disclaimer</SectionTitle>
          <Paragraph>
            Your use of the Service is at your sole risk. The Service is
            provided on an "AS IS" and "AS AVAILABLE" basis. The Service is
            provided without warranties of any kind, whether express or implied,
            including, but not limited to, implied warranties of
            merchantability, fitness for a particular purpose, non-infringement
            or course of performance.
          </Paragraph>

          <Paragraph>
            Homegroups does not warrant that a) the Service will function
            uninterrupted, secure or available at any particular time or
            location; b) any errors or defects will be corrected; c) the Service
            is free of viruses or other harmful components; or d) the results of
            using the Service will meet your requirements.
          </Paragraph>

          <SectionTitle>11. Governing Law</SectionTitle>
          <Paragraph>
            These Terms shall be governed and construed in accordance with the
            laws of the United States, without regard to its conflict of law
            provisions.
          </Paragraph>

          <Paragraph>
            Our failure to enforce any right or provision of these Terms will
            not be considered a waiver of those rights. If any provision of
            these Terms is held to be invalid or unenforceable by a court, the
            remaining provisions of these Terms will remain in effect.
          </Paragraph>

          <SectionTitle>12. Severability</SectionTitle>
          <Paragraph>
            If any provision of these Terms is found to be unenforceable or
            invalid under any applicable law, such unenforceability or
            invalidity shall not render these Terms unenforceable or invalid as
            a whole, and such provisions shall be deleted without affecting the
            remaining provisions herein.
          </Paragraph>

          <SectionTitle>13. Changes to Service</SectionTitle>
          <Paragraph>
            We reserve the right, at our sole discretion, to modify or replace
            these Terms at any time. If a revision is material we will provide
            at least 30 days' notice prior to any new terms taking effect. What
            constitutes a material change will be determined at our sole
            discretion.
          </Paragraph>

          <SectionTitle>14. Contact Information</SectionTitle>
          <Paragraph>
            If you have any questions about these Terms, please contact us:
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
            By using our Service, you acknowledge that you have read these Terms
            of Service, understand them, and agree to be bound by them.
          </Paragraph>
        </TermsContent>
      </TermsSection>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default TermsPage;
