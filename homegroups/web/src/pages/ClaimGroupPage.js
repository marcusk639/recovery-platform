import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { httpsCallable } from "firebase/functions";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
  signOut,
} from "firebase/auth";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { auth, functions } from "../lib/firebase";

const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
if (!STRIPE_PUBLISHABLE_KEY) {
  // Fail loudly at load time instead of producing a confusing "Invalid API
  // Key" error during checkout.
  console.error(
    "REACT_APP_STRIPE_PUBLISHABLE_KEY is not set — payments will fail.",
  );
}
const stripePromise = STRIPE_PUBLISHABLE_KEY
  ? loadStripe(STRIPE_PUBLISHABLE_KEY)
  : null;

// Map Firebase Auth error codes to user-friendly messages. Anything not in
// this table falls through to a generic message so raw Firebase error strings
// never reach end users.
function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use":
      "An account already exists with that email. Try signing in instead.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Allow popups or try email sign-in.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a few minutes and try again.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

const CARD_STYLE = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1a202c",
      "::placeholder": { color: "#a0aec0" },
    },
    invalid: { color: "#c53030" },
  },
};

// ---------- Styled ----------
const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 4rem 1rem 3rem;
  color: white;
  text-align: center;
`;

const PageTitle = styled.h1`
  font-size: 2rem;
  margin: 0 0 0.5rem;
`;

const PageSubtitle = styled.p`
  font-size: 1.05rem;
  opacity: 0.9;
  margin: 0;
`;

const ContentSection = styled.section`
  padding: 2.5rem 1rem 4rem;
`;

const Card = styled.div`
  max-width: 520px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 2rem;
`;

const SectionHeading = styled.h2`
  margin: 0 0 1rem;
  font-size: 1.25rem;
`;

const Helper = styled.p`
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin: 0 0 1.25rem;
`;

const GoogleButton = styled.button`
  width: 100%;
  padding: 0.875rem 1rem;
  background: white;
  color: #1a202c;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover {
    background: #f9fafb;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin: 1.25rem 0;

  &::before,
  &::after {
    content: "";
    flex: 1;
    border-bottom: 1px solid #e5e7eb;
  }
  &::before {
    margin-right: 0.75rem;
  }
  &::after {
    margin-left: 0.75rem;
  }
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

const CardField = styled.div`
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
`;

const PrimaryButton = styled.button`
  width: 100%;
  padding: 0.9rem 1rem;
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

const TabRow = styled.div`
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
`;

const Tab = styled.button`
  flex: 1;
  padding: 0.65rem;
  background: none;
  border: none;
  border-bottom: 2px solid
    ${(p) => (p.$active ? "var(--primary-color)" : "transparent")};
  color: ${(p) =>
    p.$active ? "var(--primary-color)" : "var(--text-secondary)"};
  font-weight: 600;
  cursor: pointer;
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
  margin-bottom: 1rem;
  font-size: 0.95rem;
`;

const SignedInRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f3f4f6;
  padding: 0.65rem 0.9rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  font-size: 0.9rem;
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: underline;
`;

const BackLink = styled(Link)`
  display: inline-block;
  margin-top: 1rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
`;

// ---------- Auth form (signed-out state) ----------
function AuthForm() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resetSent, setResetSent] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged in the parent handles the state transition.
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError("Enter your email address above, then click Forgot password.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        // Kick off email verification immediately; the parent will render the
        // "verify your email" gate until the user confirms.
        try {
          await sendEmailVerification(cred.user);
        } catch (e) {
          // Non-fatal: the user can request another verification email from
          // the verification prompt.
          console.warn("sendEmailVerification failed:", e);
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeading>Sign in to claim this group</SectionHeading>
      <Helper>
        Claiming requires an account so we can verify who you are and contact
        you about the group.
      </Helper>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <GoogleButton onClick={handleGoogle} disabled={busy}>
        Continue with Google
      </GoogleButton>

      <Divider>or</Divider>

      <TabRow>
        <Tab $active={mode === "signin"} onClick={() => setMode("signin")}>
          Sign in
        </Tab>
        <Tab $active={mode === "signup"} onClick={() => setMode("signup")}>
          Create account
        </Tab>
      </TabRow>

      <form onSubmit={handleEmail}>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {mode === "signin" &&
          (resetSent ? (
            <SuccessBanner
              style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}
            >
              Password reset email sent — check your inbox.
            </SuccessBanner>
          ) : (
            <LinkButton
              type="button"
              onClick={handlePasswordReset}
              disabled={busy}
              style={{
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
                display: "block",
              }}
            >
              Forgot password?
            </LinkButton>
          ))}
        <PrimaryButton type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </PrimaryButton>
      </form>
    </>
  );
}

// ---------- Checkout form (signed-in state) ----------
function CheckoutForm({ user, group, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [name, setName] = useState(user.displayName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    try {
      const { paymentMethod, error: stripeError } =
        await stripe.createPaymentMethod({
          type: "card",
          card: elements.getElement(CardElement),
          billing_details: { email: user.email, name },
        });
      if (stripeError) throw new Error(stripeError.message);

      const fn = httpsCallable(functions, "requestAdminAccessWithSubscription");
      const result = await fn({
        paymentMethodId: paymentMethod.id,
        groupId: group.id,
        email: user.email,
        name,
        message: "Claimed via web",
      });

      if (result.data?.success) {
        onSuccess();
      } else {
        throw new Error(
          result.data?.error || "Subscription could not be created.",
        );
      }
    } catch (err) {
      // Prefer the Firebase HttpsError `message` (set by our callable) for
      // backend errors; fall back to a generic message.
      const msg = err?.message || "Payment failed. Please try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <SectionHeading>Confirm and pay</SectionHeading>
      <Helper>
        $12/year subscription for {group ? group.name : "this group"}. Covers
        admin tools for the whole group. Cancel anytime.
      </Helper>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Label htmlFor="name">Full name (on card)</Label>
      <Input
        id="name"
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />

      <Label>Card details</Label>
      <CardField>
        <CardElement options={CARD_STYLE} />
      </CardField>

      <PrimaryButton type="submit" disabled={!stripe || busy}>
        {busy ? "Processing…" : "Subscribe — $12/year"}
      </PrimaryButton>
    </form>
  );
}

// ---------- Email verification gate ----------
// Email/password sign-ups land here until they click the verification link.
// Google sign-ins skip this because Google is a trusted email provider
// (user.emailVerified === true immediately).
function VerifyEmailGate({ user, onVerified }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await reload(user);
      if (user.emailVerified) {
        onVerified();
      } else {
        setNotice("Not verified yet. Check your email and click the link.");
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeading>Verify your email</SectionHeading>
      <Helper>
        We sent a verification link to <strong>{user.email}</strong>. Click it,
        then return here and refresh to continue.
      </Helper>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {notice && <SuccessBanner>{notice}</SuccessBanner>}

      <PrimaryButton onClick={handleRefresh} disabled={busy}>
        {busy ? "Checking…" : "I've verified my email — continue"}
      </PrimaryButton>
      <LinkButton
        onClick={handleResend}
        disabled={busy}
        style={{ marginTop: "1rem", display: "inline-block" }}
      >
        Resend verification email
      </LinkButton>
    </>
  );
}

// ---------- Page ----------
const ClaimGroupPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [group, setGroup] = useState(null);
  const [groupError, setGroupError] = useState(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // After email verification we need to force a re-render since reload(user)
  // mutates the existing user object in place and React won't see a new
  // reference. Replacing state with a fresh shallow copy does the trick.
  const refreshUser = () => {
    if (auth.currentUser) {
      setUser({
        ...auth.currentUser,
        emailVerified: auth.currentUser.emailVerified,
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, "getPublicGroupProfile");
        const result = await fn({ groupId: id });
        if (!cancelled) setGroup(result.data);
      } catch (err) {
        if (!cancelled)
          setGroupError(err.message || "Unable to load group information.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const groupLabel = group ? group.name : "this group";
  const alreadyClaimed = group?.isClaimed === true;

  return (
    <PageContainer>
      <HeroSection>
        <PageTitle>Claim {groupLabel}</PageTitle>
        <PageSubtitle>
          {claimed
            ? "Subscription active. Welcome, trusted servant."
            : "Become the admin for this group in a couple of minutes."}
        </PageSubtitle>
      </HeroSection>

      <ContentSection>
        <Card>
          {groupError && (
            <ErrorBanner>Could not load this group. {groupError}</ErrorBanner>
          )}

          {!groupError && alreadyClaimed && !claimed && (
            <>
              <SectionHeading>This group is already claimed</SectionHeading>
              <Helper>
                An admin has already taken responsibility for {groupLabel}. If
                you believe this is incorrect, contact support.
              </Helper>
              <BackLink to={`/groups/${id}`}>← Back to group page</BackLink>
            </>
          )}

          {!groupError && !alreadyClaimed && claimed && (
            <>
              <SuccessBanner>
                You're now the admin for {groupLabel}. Download the Homegroups
                app to start managing meetings, treasury, and service positions.
              </SuccessBanner>
              <PrimaryButton onClick={() => navigate(`/groups/${id}`)}>
                View group page
              </PrimaryButton>
            </>
          )}

          {!groupError && !alreadyClaimed && !claimed && authReady && !user && (
            <AuthForm />
          )}

          {!groupError &&
            !alreadyClaimed &&
            !claimed &&
            authReady &&
            user &&
            !user.emailVerified && (
              <>
                <SignedInRow>
                  <span>
                    Signed in as{" "}
                    <strong>{user.email || user.displayName}</strong>
                  </span>
                  <LinkButton onClick={() => signOut(auth)}>
                    Sign out
                  </LinkButton>
                </SignedInRow>
                <VerifyEmailGate user={user} onVerified={refreshUser} />
              </>
            )}

          {!groupError &&
            !alreadyClaimed &&
            !claimed &&
            authReady &&
            user &&
            user.emailVerified &&
            group && (
              <>
                <SignedInRow>
                  <span>
                    Signed in as{" "}
                    <strong>{user.email || user.displayName}</strong>
                  </span>
                  <LinkButton onClick={() => signOut(auth)}>
                    Sign out
                  </LinkButton>
                </SignedInRow>
                <Elements stripe={stripePromise}>
                  <CheckoutForm
                    user={user}
                    group={group}
                    onSuccess={() => setClaimed(true)}
                  />
                </Elements>
              </>
            )}
        </Card>
      </ContentSection>
    </PageContainer>
  );
};

export default ClaimGroupPage;
