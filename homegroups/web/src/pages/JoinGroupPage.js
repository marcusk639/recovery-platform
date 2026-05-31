import React from "react";
import { useParams, Link } from "react-router-dom";
import styled from "styled-components";
import { getStoreUrl, detectPlatform } from "../lib/deepLinks";

const Container = styled.div`
  padding: 6rem 1rem 5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-height: 80vh;
`;

const Logo = styled.div`
  font-size: 3rem;
  margin-bottom: 1.5rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  color: var(--text-dark);
  margin-bottom: 0.75rem;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: var(--text-light);
  max-width: 480px;
  margin: 0 auto 2.5rem;
`;

const CodeCard = styled.div`
  background: var(--primary-color, #2196f3);
  border-radius: 1rem;
  padding: 2rem 3rem;
  margin-bottom: 2.5rem;
  box-shadow: 0 4px 20px rgba(33, 150, 243, 0.3);
`;

const CodeLabel = styled.p`
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.875rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
`;

const Code = styled.span`
  color: white;
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: 0.25em;
  font-family: monospace;
`;

const InstructionList = styled.ol`
  text-align: left;
  max-width: 380px;
  margin: 0 auto 2.5rem;
  color: var(--text-light);
  font-size: 1rem;
  line-height: 1.8;
`;

const GetAppButton = styled.a`
  display: inline-block;
  background-color: var(--primary-color, #2196f3);
  color: white;
  padding: 0.875rem 2.25rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1.125rem;
  text-decoration: none;
  margin-bottom: 1rem;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--primary-dark, #1976d2);
    text-decoration: none;
  }
`;

const AlreadyHaveApp = styled.p`
  font-size: 0.875rem;
  color: var(--text-light);
  margin-top: 1rem;
`;

const HomeLink = styled(Link)`
  color: var(--primary-color, #2196f3);
  font-size: 0.875rem;
`;

const JoinGroupPage = () => {
  const { code } = useParams();
  const displayCode = (code || "").toUpperCase();
  const platform = detectPlatform();
  const isMobile = platform === "ios" || platform === "android";

  return (
    <Container>
      <Logo>🏠</Logo>
      <Title>You've been invited to join a group on Homegroups</Title>
      <Subtitle>
        Open the Homegroups app and enter the invite code below to join your
        group.
      </Subtitle>

      <CodeCard>
        <CodeLabel>Your invite code</CodeLabel>
        <Code>{displayCode}</Code>
      </CodeCard>

      <InstructionList>
        <li>
          {isMobile
            ? "Download the Homegroups app"
            : "Install the Homegroups app on your phone"}
        </li>
        <li>Sign in or create a free account</li>
        <li>
          Tap <strong>Join a Group</strong> on your group list screen
        </li>
        <li>
          Enter the code <strong>{displayCode}</strong>
        </li>
      </InstructionList>

      <GetAppButton
        href={getStoreUrl()}
        target="_blank"
        rel="noopener noreferrer"
      >
        {isMobile ? "Download Homegroups" : "Get the App"}
      </GetAppButton>

      <AlreadyHaveApp>
        Already have the app? Open it and tap <strong>Join a Group</strong>,
        then enter code <strong>{displayCode}</strong>.
      </AlreadyHaveApp>

      <HomeLink to="/" style={{ marginTop: "2rem" }}>
        Learn more about Homegroups →
      </HomeLink>
    </Container>
  );
};

export default JoinGroupPage;
