import React from "react";
import styled from "styled-components";
import LeadCaptureForm from "../components/LeadCaptureForm";

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 5rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 820px;
  margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 2.5rem;
  margin: 0 0 1rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.15rem;
  opacity: 0.95;
  margin: 0;
`;

const SectionContainer = styled.section`
  padding: 4rem 1rem;
  background: ${(p) =>
    p.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const SectionHeading = styled.h2`
  text-align: center;
  margin: 0 0 2rem;
`;

const BulletList = styled.ul`
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
  color: var(--text-secondary);
`;

const PricingCard = styled.div`
  max-width: 420px;
  margin: 0 auto;
  background: white;
  border-radius: 10px;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;

const TierName = styled.h3`
  margin: 0 0 0.25rem;
  color: var(--primary-color);
`;

const TierPrice = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0 1rem;
`;

const TierAnchor = styled.a`
  display: inline-block;
  padding: 0.75rem 1.75rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
`;

const IntergroupsPage = () => (
  <PageContainer>
    <HeroSection>
      <HeroContent>
        <PageTitle>One dashboard for your whole intergroup.</PageTitle>
        <PageSubtitle>
          Coordinate 20–100 groups, aggregate financial reporting, broadcast
          announcements, and onboard new groups in bulk — without the
          spreadsheet sprawl.
        </PageSubtitle>
      </HeroContent>
    </HeroSection>

    <SectionContainer>
      <Container>
        <SectionHeading>Built for district-level service</SectionHeading>
        <BulletList>
          <li>
            <strong>Multi-group dashboard.</strong> See every affiliated group's
            claimed status, meeting schedule, and rough activity level at a
            glance.
          </li>
          <li>
            <strong>Aggregate financial reporting.</strong> Roll up treasury
            contributions across groups for your own reporting needs without
            asking each treasurer for a spreadsheet.
          </li>
          <li>
            <strong>Cross-group announcements.</strong> Broadcast events and
            notices to members across all affiliated groups with one post.
          </li>
          <li>
            <strong>Bulk group onboarding.</strong> Invite all your district's
            groups at once with a pre-filled claim link.
          </li>
          <li>
            <strong>Institutional memory.</strong> Officer rotations, meeting
            changes, and service-position history preserved across the whole
            intergroup, not just individual groups.
          </li>
        </BulletList>
      </Container>
    </SectionContainer>

    <SectionContainer alternate id="pricing">
      <Container>
        <SectionHeading>Pricing</SectionHeading>
        <PricingCard>
          <TierName>Intergroup Subscription</TierName>
          <TierPrice>$99 / year</TierPrice>
          <p
            style={{
              color: "var(--text-secondary)",
              margin: "0 0 1.5rem",
            }}
          >
            Covers the whole intergroup regardless of how many groups you
            coordinate. Individual groups still subscribe at $12/year for their
            own admin tools.
          </p>
          <TierAnchor href="#contact">Request information</TierAnchor>
        </PricingCard>
      </Container>
    </SectionContainer>

    <SectionContainer id="contact">
      <Container>
        <SectionHeading>Request information</SectionHeading>
        <LeadCaptureForm
          kind="intergroup"
          title="Tell us about your intergroup"
          subtitle="We'll reach out within one business day to walk through the dashboard with you."
        />
      </Container>
    </SectionContainer>
  </PageContainer>
);

export default IntergroupsPage;
