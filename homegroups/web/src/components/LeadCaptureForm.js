import React, { useState } from "react";
import styled from "styled-components";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

const FormContainer = styled.form`
  max-width: 560px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
`;

const FormTitle = styled.h3`
  margin: 0 0 0.5rem;
`;

const FormSubtitle = styled.p`
  color: var(--text-secondary);
  margin: 0 0 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin: 0.75rem 0 0.35rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  min-height: 100px;
  resize: vertical;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  box-sizing: border-box;
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 0.9rem;
  margin-top: 1.25rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--primary-dark);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Honeypot = styled.input`
  position: absolute;
  left: -9999px;
  opacity: 0;
  pointer-events: none;
`;

const ErrorBanner = styled.div`
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
`;

const SuccessBanner = styled.div`
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  color: #065f46;
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
`;

/**
 * Shared lead-capture form used by partnership landing pages.
 *
 * Props:
 *   kind       - "treatment_center" | "intergroup"
 *   title      - form heading
 *   subtitle   - form subheading
 *   tiers      - optional array of strings for the tier selector; if omitted,
 *                no tier dropdown is rendered
 */
export default function LeadCaptureForm({ kind, title, subtitle, tiers }) {
  const [organizationName, setOrg] = useState("");
  const [contactName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState(tiers ? tiers[0] : "");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "submitPartnershipLead");
      await fn({
        kind,
        organizationName,
        contactName,
        email,
        phone,
        tier: tiers ? tier : undefined,
        notes,
        website, // honeypot — empty in normal flow
      });
      setSubmitted(true);
    } catch (err) {
      setError(
        err?.message ||
          "Could not submit your request. Please try again or email us directly.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <FormContainer as="div">
        <SuccessBanner>
          <strong>Thanks — we've got your request.</strong>
          <br />
          We'll reach out within one business day at {email}.
        </SuccessBanner>
      </FormContainer>
    );
  }

  return (
    <FormContainer onSubmit={handleSubmit}>
      <FormTitle>{title}</FormTitle>
      <FormSubtitle>{subtitle}</FormSubtitle>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Label htmlFor="organizationName">Organization name</Label>
      <Input
        id="organizationName"
        type="text"
        required
        value={organizationName}
        onChange={(e) => setOrg(e.target.value)}
        autoComplete="organization"
      />

      <Label htmlFor="contactName">Your name</Label>
      <Input
        id="contactName"
        type="text"
        required
        value={contactName}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <Label htmlFor="phone">Phone (optional)</Label>
      <Input
        id="phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
      />

      {tiers && (
        <>
          <Label htmlFor="tier">Interested tier</Label>
          <Select
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </>
      )}

      <Label htmlFor="notes">Anything we should know? (optional)</Label>
      <Textarea
        id="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {/* Honeypot — real users never see or fill this */}
      <Honeypot
        type="text"
        name="website"
        tabIndex="-1"
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <SubmitButton type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Request information"}
      </SubmitButton>
    </FormContainer>
  );
}
