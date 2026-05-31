import React from "react";
import styled from "styled-components";
import {
  buildGroupDeepLink,
  buildClaimDeepLink,
  getStoreUrl,
} from "../lib/deepLinks";

const CtaSection = styled.div`
  background: var(--background-alt);
  padding: 2rem;
  border-radius: 8px;
  margin-top: 2rem;
  text-align: center;
`;

const CtaHeading = styled.h3`
  margin: 0 0 0.75rem;
  color: var(--text-primary);
`;

const CtaSubtext = styled.p`
  margin: 0 0 1.5rem;
  color: var(--text-secondary);
`;

const PrimaryButton = styled.a`
  display: inline-block;
  padding: 0.875rem 1.75rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: background-color 0.2s;

  &:hover {
    background: var(--primary-dark);
  }
`;

const SecondaryButton = styled.a`
  display: inline-block;
  margin-top: 0.75rem;
  padding: 0.5rem 1rem;
  color: var(--primary-color);
  text-decoration: underline;
  font-size: 0.95rem;
`;

const UnclaimedBanner = styled.div`
  background: #fff8e1;
  border: 1px solid #ffe082;
  color: #7a5900;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin: 1.5rem 0;
`;

export default function GroupCallToAction({ group }) {
  if (!group) return null;

  if (group.isClaimed) {
    return (
      <CtaSection>
        <CtaHeading>Connect with this group</CtaHeading>
        <CtaSubtext>
          Open {group.name} in the Homegroups app to see members, announcements,
          and the full meeting schedule.
        </CtaSubtext>
        <PrimaryButton href={buildGroupDeepLink(group.id)}>
          Open in Homegroups app
        </PrimaryButton>
        <br />
        <SecondaryButton href={getStoreUrl()}>
          Don't have the app? Download →
        </SecondaryButton>
      </CtaSection>
    );
  }

  // Unclaimed
  return (
    <>
      <UnclaimedBanner>
        <strong>This group hasn't been claimed yet.</strong> Meeting info may be
        out of date.
      </UnclaimedBanner>
      <CtaSection>
        <CtaHeading>Are you a trusted servant of this group?</CtaHeading>
        <CtaSubtext>
          Claim this group to keep meeting info accurate, communicate with
          members, and manage the group treasury.
        </CtaSubtext>
        <PrimaryButton href={buildClaimDeepLink(group.id)}>
          Claim this group →
        </PrimaryButton>
        <br />
        <SecondaryButton href={getStoreUrl()}>
          Download the Homegroups app
        </SecondaryButton>
      </CtaSection>
    </>
  );
}
