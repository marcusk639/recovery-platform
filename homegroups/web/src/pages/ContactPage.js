import React from "react";
import styled from "styled-components";

const SUPPORT_EMAIL = "admin@homegroups-app.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "Get Started with Homegroups",
)}&body=${encodeURIComponent(
  "Hi Homegroups team,\n\nI'd like to learn more about using Homegroups for my recovery group.\n\nGroup name (optional):\nApproximate group size:\nWhat I'm hoping to use it for:\n\nThanks,\n",
)}`;

const PageContainer = styled.div`
  padding: 10rem 1rem 5rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  text-align: center;
  max-width: 700px;
  margin: 0 auto 4rem;
`;

const PageTitle = styled.h1`
  font-size: 3rem;
  color: var(--text-dark);
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.25rem;
  color: var(--text-light);

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;

  @media (max-width: 992px) {
    grid-template-columns: 1fr;
    gap: 3rem;
  }
`;

const ContactInfo = styled.div``;

const CtaCard = styled.div`
  background-color: white;
  padding: 2.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

const CtaTitle = styled.h2`
  font-size: 1.5rem;
  color: var(--text-dark);
  margin-bottom: 1rem;
`;

const CtaBody = styled.p`
  color: var(--text-light);
  line-height: 1.6;
  margin-bottom: 2rem;
`;

const CtaButton = styled.a`
  display: inline-block;
  background-color: var(--primary-color);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 1rem;
  text-decoration: none;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: var(--primary-dark);
  }
`;

const InfoCard = styled.div`
  margin-bottom: 2rem;
`;

const InfoTitle = styled.h3`
  font-size: 1.25rem;
  color: var(--text-dark);
  margin-bottom: 1rem;
`;

const InfoText = styled.p`
  color: var(--text-light);
  margin-bottom: 0.5rem;
  line-height: 1.6;
`;

const InfoLink = styled.a`
  color: var(--primary-color);
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
`;

const ContactPage = () => {
  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Get Started with Homegroups</PageTitle>
        <PageSubtitle>
          We're here to help your recovery group thrive with our tools. Reach
          out to learn more or sign up for a free trial.
        </PageSubtitle>
      </PageHeader>

      <ContentGrid>
        <ContactInfo>
          <InfoCard>
            <InfoTitle>Contact Information</InfoTitle>
            <InfoText>
              We're here to answer any questions you have about Recovery
              Connect.
            </InfoText>
            <InfoText>
              Email:{" "}
              <InfoLink href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </InfoLink>
            </InfoText>
            <InfoText>
              Phone: <InfoLink href="tel:+1234567890">(123) 456-7890</InfoLink>
            </InfoText>
          </InfoCard>

          <InfoCard>
            <InfoTitle>Office Hours</InfoTitle>
            <InfoText>Monday - Friday: 9:00 AM - 5:00 PM EST</InfoText>
            <InfoText>Saturday - Sunday: Closed</InfoText>
          </InfoCard>

          <InfoCard>
            <InfoTitle>Need Help?</InfoTitle>
            <InfoText>
              Check out our <InfoLink href="/faq">FAQ</InfoLink> for quick
              answers or schedule a <InfoLink href="/demo">free demo</InfoLink>{" "}
              to see the app in action.
            </InfoText>
          </InfoCard>
        </ContactInfo>

        <CtaCard>
          <CtaTitle>Start Your Free Trial</CtaTitle>
          <CtaBody>
            Email our team and we'll help you get set up. We usually reply
            within one business day. Let us know your group's name, approximate
            size, and what you're hoping to use Homegroups for.
          </CtaBody>
          <CtaButton href={SUPPORT_MAILTO}>Email Us</CtaButton>
        </CtaCard>
      </ContentGrid>
    </PageContainer>
  );
};

export default ContactPage;
