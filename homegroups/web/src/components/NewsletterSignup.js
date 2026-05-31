import React, { useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

const SignupContainer = styled.section`
  padding: 5rem 1rem;
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  color: white;
`;

const SignupContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const SignupTitle = styled.h2`
  font-size: 2.25rem;
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 1.75rem;
  }
`;

const SignupSubtitle = styled.p`
  font-size: 1.25rem;
  margin-bottom: 2.5rem;
  opacity: 0.9;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const Form = styled.form`
  display: flex;
  max-width: 600px;
  margin: 0 auto;

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 1rem;
  }
`;

const EmailInput = styled.input`
  flex-grow: 1;
  padding: 1rem 1.5rem;
  border-radius: 0.375rem 0 0 0.375rem;
  border: none;
  font-size: 1rem;
  outline: none;

  @media (max-width: 640px) {
    border-radius: 0.375rem;
  }
`;

const SubmitButton = styled.button`
  background-color: var(--text-dark);
  color: white;
  padding: 1rem 2rem;
  border: none;
  border-radius: 0 0.375rem 0.375rem 0;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background-color: #000;
  }

  @media (max-width: 640px) {
    border-radius: 0.375rem;
  }
`;

const ThankYouMessage = styled(motion.div)`
  margin-top: 1.5rem;
  font-weight: 500;
`;

const PrivacyNote = styled.p`
  font-size: 0.875rem;
  margin-top: 1.5rem;
  opacity: 0.7;
`;

const NewsletterSignup = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) {
      // In a real implementation, you would send this to your API
      console.log(`Submitted email: ${email}`);
      setSubmitted(true);
      setEmail("");
    }
  };

  return (
    <SignupContainer>
      <SignupContent
        ref={ref}
        as={motion.div}
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        <SignupTitle>Stay Updated on Homegroups</SignupTitle>
        <SignupSubtitle>
          Join our newsletter for updates, features, and tips for your recovery
          group.
        </SignupSubtitle>

        <Form onSubmit={handleSubmit}>
          <EmailInput
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <SubmitButton type="submit">Subscribe</SubmitButton>
        </Form>

        {submitted && (
          <ThankYouMessage
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3 }}
          >
            Thank you for subscribing! We'll be in touch soon.
          </ThankYouMessage>
        )}

        <PrivacyNote>
          We respect your privacy. Unsubscribe at any time. We never share your
          information.
        </PrivacyNote>
      </SignupContent>
    </SignupContainer>
  );
};

export default NewsletterSignup;
