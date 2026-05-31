import React, { useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import LeadCaptureForm from "../components/LeadCaptureForm";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";

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
  font-size: 2.75rem;
  margin: 0 0 1rem;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.2rem;
  opacity: 0.95;
  margin: 0 0 1.5rem;
`;

const SectionContainer = styled.section`
  padding: 4rem 1rem;
  background: ${(p) =>
    p.alternate ? "var(--background-alt)" : "var(--background)"};
`;

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const SectionHeading = styled.h2`
  text-align: center;
  margin: 0 0 2rem;
`;

const BulletGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const BulletCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
`;

const BulletTitle = styled.h3`
  margin: 0 0 0.5rem;
  color: var(--primary-color);
`;

const PricingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin-top: 2rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const PricingCard = styled.div`
  background: white;
  border-radius: 10px;
  padding: 2rem 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
`;

const TierName = styled.h3`
  margin: 0 0 0.25rem;
  color: var(--primary-color);
`;

const TierPrice = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0.5rem 0 1rem;
`;

const TierList = styled.ul`
  margin: 0 0 1.5rem;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  line-height: 1.55;
  flex: 1;
`;

const TierAnchor = styled.a`
  display: inline-block;
  padding: 0.75rem 1rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  text-align: center;
`;

const TierButton = styled.button`
  display: inline-block;
  padding: 0.75rem 1rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  text-align: center;
  border: none;
  cursor: pointer;
  font-size: 1rem;
`;

const FaqItem = styled.div`
  margin-bottom: 1.25rem;
`;

const FaqQuestion = styled.h4`
  margin: 0 0 0.35rem;
`;

const FaqAnswer = styled.p`
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
`;

const TIERS = [
  {
    name: "Basic Listing",
    price: "$99/mo",
    bullets: [
      "Listing in the in-app Resources directory",
      "Visible to users searching for post-discharge support",
      "Contact details displayed to interested members",
    ],
  },
  {
    name: "Referral Partner",
    price: "$299/mo",
    bullets: [
      "Everything in Basic Listing",
      "Direct patient-to-group referrals",
      "Engagement analytics (group joins, meeting attendance)",
      "Alumni check-in dashboard",
    ],
  },
  {
    name: "White-Label Integration",
    price: "$999/mo",
    bullets: [
      "Everything in Referral Partner",
      "Branded app instance for your alumni program",
      "SSO for your clinical staff",
      "Compliance reporting exports",
    ],
  },
];

function CheckoutEmailForm({ busy, onSubmit }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email, password, mode === "signup");
      }}
    >
      <div style={{ display: "flex", gap: 0, marginBottom: "0.75rem" }}>
        {["signin", "signup"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              flex: 1,
              padding: "0.5rem",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${mode === m ? "#2196F3" : "transparent"}`,
              color: mode === m ? "#2196F3" : "#757575",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        style={inputStyle}
      />
      <input
        type="password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={inputStyle}
      />
      <button
        type="submit"
        disabled={busy}
        style={{
          width: "100%",
          padding: "0.75rem",
          backgroundColor: "#2196F3",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
          marginTop: "0.5rem",
        }}
      >
        {busy
          ? "Please wait…"
          : mode === "signup"
            ? "Create account & pay"
            : "Sign in & pay"}
      </button>
    </form>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "0.6rem 0.75rem",
  border: "1px solid #D1D5DB",
  borderRadius: "6px",
  fontSize: "0.95rem",
  marginBottom: "0.5rem",
  boxSizing: "border-box",
};

const modalStyles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "2rem",
    width: "100%",
    maxWidth: "400px",
    position: "relative",
  },
  close: {
    position: "absolute",
    top: "1rem",
    right: "1rem",
    background: "none",
    border: "none",
    fontSize: "1.25rem",
    cursor: "pointer",
    color: "#9E9E9E",
  },
  title: { fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.25rem" },
  subtitle: { fontSize: "0.9rem", color: "#757575", marginBottom: "1rem" },
  error: {
    backgroundColor: "#fee2e2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
    padding: "0.65rem 0.75rem",
    borderRadius: "6px",
    fontSize: "0.875rem",
    marginBottom: "0.75rem",
  },
  googleBtn: {
    width: "100%",
    padding: "0.7rem",
    backgroundColor: "#fff",
    border: "1px solid #D1D5DB",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "0.5rem",
  },
  divider: {
    textAlign: "center",
    color: "#9E9E9E",
    fontSize: "0.875rem",
    margin: "0.75rem 0",
  },
};

const TreatmentCentersPage = () => {
  const { ref: refA, inView: inViewA } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [checkoutState, setCheckoutState] = useState(null);
  const [facilityName, setFacilityName] = useState("");
  const [facilityNameError, setFacilityNameError] = useState("");

  const handleGetStarted = (tier, tierName) => {
    setFacilityName("");
    setFacilityNameError("");
    setCheckoutState({ tier, tierName, busy: false, error: null });
  };

  const handleCheckout = async (
    email,
    password,
    isNewAccount,
    existingUser = null,
  ) => {
    if (!checkoutState) return;

    if (!facilityName.trim()) {
      setFacilityNameError("Please enter your facility name.");
      return;
    }
    setFacilityNameError("");

    setCheckoutState((s) => ({ ...s, busy: true, error: null }));
    try {
      let user = existingUser ?? auth.currentUser;
      if (!user) {
        if (isNewAccount) {
          const cred = await createUserWithEmailAndPassword(
            auth,
            email,
            password,
          );
          user = cred.user;
        } else {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          user = cred.user;
        }
      }

      const createIntergroup = httpsCallable(functions, "createIntergroup");
      const result = await createIntergroup({
        name: facilityName.trim() || "Treatment Center",
        type: "treatment_center",
        tier: checkoutState.tier,
        successUrl: `${window.location.origin}/treatment-center-success`,
        cancelUrl: `${window.location.origin}/treatment-center-cancel`,
      });

      const { checkoutUrl } = result.data;
      window.location.href = checkoutUrl;
    } catch (err) {
      const msg =
        err?.code === "auth/invalid-credential"
          ? "Email or password is incorrect."
          : err?.code === "auth/email-already-in-use"
            ? "An account with that email already exists. Try signing in."
            : (err?.message ?? "Something went wrong. Please try again.");
      setCheckoutState((s) => ({ ...s, busy: false, error: msg }));
    }
  };

  const handleGoogleCheckout = async () => {
    if (!checkoutState) return;

    if (!facilityName.trim()) {
      setFacilityNameError("Please enter your facility name.");
      return;
    }
    setFacilityNameError("");

    setCheckoutState((s) => ({ ...s, busy: true, error: null }));
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      if (!cred.user.emailVerified) {
        try {
          await sendEmailVerification(cred.user);
        } catch (e) {
          console.warn("sendEmailVerification failed:", e);
        }
        await signOut(auth);
        setCheckoutState((s) => ({
          ...s,
          busy: false,
          error:
            "Please verify your email address. A verification email has been sent.",
        }));
        return;
      }
      await handleCheckout(null, null, false, cred.user);
    } catch (err) {
      const googleMsg =
        err?.code === "auth/popup-closed-by-user"
          ? "Sign-in was cancelled."
          : err?.code === "auth/popup-blocked"
            ? "Please allow popups for this site and try again."
            : err?.code === "auth/cancelled-popup-request"
              ? "Sign-in was cancelled."
              : "Google sign-in failed. Please try again.";
      setCheckoutState((s) => ({
        ...s,
        busy: false,
        error: googleMsg,
      }));
    }
  };

  return (
    <PageContainer>
      <HeroSection>
        <HeroContent>
          <PageTitle>Bridge the aftercare gap.</PageTitle>
          <PageSubtitle>
            Connect discharged patients to verified 12-step groups, track
            engagement, and close the loop on outcomes — on operational software
            built for the long arc of recovery.
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <SectionContainer>
        <Container>
          <SectionHeading>What's broken today</SectionHeading>
          <p
            style={{
              textAlign: "center",
              maxWidth: 720,
              margin: "0 auto",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            Most treatment software ends at discharge. Meanwhile, relapse rates
            in the first year post-discharge approach 85%, and the majority of
            clinicians never see follow-up data on the patients they discharged.
            Homegroups fills that gap as the operational layer between your
            facility and the 12-step community.
          </p>
        </Container>
      </SectionContainer>

      <SectionContainer
        alternate
        as={motion.section}
        ref={refA}
        initial={{ opacity: 0, y: 24 }}
        animate={inViewA ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: 0.5 }}
      >
        <Container>
          <SectionHeading>What you get</SectionHeading>
          <BulletGrid>
            <BulletCard>
              <BulletTitle>Verified group referrals</BulletTitle>
              <p>
                Refer patients directly to real, active homegroups with verified
                meeting schedules — not stale directory links.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Post-discharge engagement data</BulletTitle>
              <p>
                See which alumni joined a group, which ones are attending
                meetings, and where engagement is falling off.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Outcome reporting</BulletTitle>
              <p>
                Exportable reports for accreditation, grants, and value-based
                care contracts that increasingly require follow-up data.
              </p>
            </BulletCard>
            <BulletCard>
              <BulletTitle>Branded alumni experience</BulletTitle>
              <p>
                At the White-Label tier, give alumni a branded app experience
                that keeps your facility in the continuum of care long after
                discharge.
              </p>
            </BulletCard>
          </BulletGrid>
        </Container>
      </SectionContainer>

      <SectionContainer id="pricing">
        <Container>
          <SectionHeading>Pricing</SectionHeading>
          <PricingGrid>
            <PricingCard>
              <TierName>{TIERS[0].name}</TierName>
              <TierPrice>{TIERS[0].price}</TierPrice>
              <TierList>
                {TIERS[0].bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </TierList>
              <TierButton
                onClick={() => handleGetStarted("tier_a", "Basic Listing")}
              >
                Get Started
              </TierButton>
            </PricingCard>

            <PricingCard>
              <TierName>{TIERS[1].name}</TierName>
              <TierPrice>{TIERS[1].price}</TierPrice>
              <TierList>
                {TIERS[1].bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </TierList>
              <TierButton
                onClick={() => handleGetStarted("tier_b", "Referral Partner")}
              >
                Get Started
              </TierButton>
            </PricingCard>

            <PricingCard>
              <TierName>{TIERS[2].name}</TierName>
              <TierPrice>{TIERS[2].price}</TierPrice>
              <TierList>
                {TIERS[2].bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </TierList>
              <TierAnchor href="#contact">Request information</TierAnchor>
            </PricingCard>
          </PricingGrid>
        </Container>
      </SectionContainer>

      <SectionContainer alternate id="contact">
        <Container>
          <SectionHeading>Request information</SectionHeading>
          <LeadCaptureForm
            kind="treatment_center"
            title="Tell us about your facility"
            subtitle="We'll reach out within one business day to schedule a walkthrough."
            tiers={TIERS.map((t) => t.name)}
          />
        </Container>
      </SectionContainer>

      <SectionContainer>
        <Container>
          <SectionHeading>Common questions</SectionHeading>
          <FaqItem>
            <FaqQuestion>Is this HIPAA compliant?</FaqQuestion>
            <FaqAnswer>
              Homegroups is operational software for recovery groups, not a
              clinical record system. We do not store PHI. White-Label customers
              handling PHI-adjacent data will receive a Business Associate
              Agreement on request.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>How do patients sign up?</FaqQuestion>
            <FaqAnswer>
              Discharging staff can generate a personalized invite link or QR
              code. The patient installs the Homegroups app, connects to their
              first meeting, and your facility sees engagement data through a
              dashboard.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>Can we start with the Basic Listing tier?</FaqQuestion>
            <FaqAnswer>
              Yes. Most facilities start at Basic, confirm the value with a
              subset of alumni, then upgrade to Referral Partner within 30–60
              days.
            </FaqAnswer>
          </FaqItem>
          <FaqItem>
            <FaqQuestion>What's the minimum commitment?</FaqQuestion>
            <FaqAnswer>
              Month-to-month at Basic and Referral Partner tiers. White-Label
              integrations are custom contracts typically 12 months.
            </FaqAnswer>
          </FaqItem>
        </Container>
      </SectionContainer>

      {checkoutState && (
        <div
          style={modalStyles.overlay}
          onClick={(e) =>
            e.target === e.currentTarget && setCheckoutState(null)
          }
        >
          <div style={modalStyles.modal}>
            <button
              style={modalStyles.close}
              onClick={() => setCheckoutState(null)}
            >
              ×
            </button>
            <h2 style={modalStyles.title}>Start {checkoutState.tierName}</h2>
            <p style={modalStyles.subtitle}>
              Sign in or create an account to continue to checkout.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <input
                type="text"
                placeholder="Facility name (e.g. Sunrise Recovery Center)"
                value={facilityName}
                onChange={(e) => {
                  setFacilityName(e.target.value);
                  if (facilityNameError) setFacilityNameError("");
                }}
                style={inputStyle}
              />
              {facilityNameError && (
                <div
                  style={{
                    color: "#991b1b",
                    fontSize: "0.8rem",
                    marginTop: "0.25rem",
                  }}
                >
                  {facilityNameError}
                </div>
              )}
            </div>

            {checkoutState.error && (
              <div style={modalStyles.error}>{checkoutState.error}</div>
            )}

            <button
              style={modalStyles.googleBtn}
              onClick={handleGoogleCheckout}
              disabled={checkoutState.busy}
            >
              Continue with Google
            </button>

            <div style={modalStyles.divider}>or</div>

            <CheckoutEmailForm
              busy={checkoutState.busy}
              onSubmit={handleCheckout}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default TreatmentCentersPage;
