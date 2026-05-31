import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

const NotFoundContainer = styled.div`
  padding: 10rem 1rem 5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-height: 80vh;
`;

const Title = styled.h1`
  font-size: 6rem;
  color: var(--primary-color);
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 4rem;
  }
`;

const Subtitle = styled.h2`
  font-size: 2rem;
  margin-bottom: 2rem;
  color: var(--text-dark);

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const Message = styled.p`
  font-size: 1.25rem;
  color: var(--text-light);
  max-width: 600px;
  margin: 0 auto 2.5rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const HomeButton = styled(Link)`
  background-color: var(--primary-color);
  color: white;
  padding: 1rem 2rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 1.125rem;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--primary-dark);
    text-decoration: none;
  }
`;

const NotFoundPage = () => {
  return (
    <NotFoundContainer>
      <Title>404</Title>
      <Subtitle>Page Not Found</Subtitle>
      <Message>
        Looks like you've ventured into uncharted territory. The page you're
        looking for doesn't exist or has been moved.
      </Message>
      <HomeButton to="/">Return to Home</HomeButton>
    </NotFoundContainer>
  );
};

export default NotFoundPage;
