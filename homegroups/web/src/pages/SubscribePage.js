import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getFunctions, httpsCallable } from "firebase/functions";
import { onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { logEvent } from "firebase/analytics";
import { app, auth, analytics } from "../lib/firebase";
import styled from "styled-components";

// Fail loud at module load if the Stripe key isn't bound. Silent fallback to a
// placeholder string causes Stripe Elements to fail for every visitor — a
// revenue-zero failure mode. See docs/LAUNCH_BLOCKERS.md #7.
const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
if (
  !STRIPE_PUBLISHABLE_KEY ||
  STRIPE_PUBLISHABLE_KEY === "pk_test_your_publishable_key"
) {
  throw new Error(
    "REACT_APP_STRIPE_PUBLISHABLE_KEY is not configured. Set it in the build " +
      "environment (e.g., .env.production or hosting env vars) and rebuild. " +
      "See docs/LAUNCH_BLOCKERS.md #7.",
  );
}
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Initialize Firebase Functions
const functions = getFunctions(app);

// Styled Components - Mobile-optimized
const PageContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 0;
  display: flex;
  flex-direction: column;

  @media (min-width: 768px) {
    padding: 2rem;
    justify-content: center;
    align-items: center;
  }
`;

const Card = styled.div`
  background: white;
  width: 100%;
  min-height: 100vh;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;

  @media (min-width: 768px) {
    min-height: auto;
    max-width: 480px;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    padding: 2.5rem;
  }
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const Logo = styled.div`
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a202c;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 0.95rem;
  color: #718096;
  line-height: 1.5;
`;

const GroupInfo = styled.div`
  background: #f7fafc;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1.5rem;
  border: 1px solid #e2e8f0;
`;

const GroupName = styled.div`
  font-weight: 600;
  color: #2d3748;
  font-size: 1rem;
  margin-bottom: 0.25rem;
`;

const GroupDetail = styled.div`
  font-size: 0.875rem;
  color: #718096;
`;

const PriceSection = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  color: white;
  text-align: center;
`;

const PriceAmount = styled.div`
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
`;

const PriceInterval = styled.div`
  font-size: 0.875rem;
  opacity: 0.9;
`;

const FormSection = styled.div`
  flex: 1;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1rem;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  &:disabled {
    background: #f7fafc;
    color: #a0aec0;
  }
`;

const CardElementContainer = styled.div`
  padding: 0.875rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  transition: all 0.2s;

  &:focus-within {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }
`;

const CancelButton = styled.button`
  width: 100%;
  padding: 0.875rem;
  background: transparent;
  color: #718096;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  margin-top: 0.75rem;

  &:hover {
    color: #4a5568;
  }
`;

const ErrorMessage = styled.div`
  background: #fed7d7;
  color: #c53030;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
`;

const SuccessContainer = styled.div`
  text-align: center;
  padding: 2rem 0;
`;

const SuccessIcon = styled.div`
  width: 80px;
  height: 80px;
  background: #c6f6d5;
  border-radius: 50%;
  margin: 0 auto 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
`;

const SuccessTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #22543d;
  margin-bottom: 0.75rem;
`;

const SuccessMessage = styled.p`
  color: #718096;
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const ReturnButton = styled.a`
  display: inline-block;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }
`;

const SecureBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #a0aec0;
  margin-top: 1.5rem;
`;

const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// Card Element styling
const cardElementOptions = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1a202c",
      "::placeholder": {
        color: "#a0aec0",
      },
    },
    invalid: {
      color: "#c53030",
    },
  },
};

// Checkout Form Component
function CheckoutForm({ params, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState(params.email || "");
  const [name, setName] = useState(params.name || "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    logEvent(analytics, "subscription_attempt", {
      price_usd: 12,
      billing_period: "annual",
    });
    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create payment method
      const { paymentMethod, error: stripeError } =
        await stripe.createPaymentMethod({
          type: "card",
          card: elements.getElement(CardElement),
          billing_details: {
            email,
            name,
          },
        });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      // Call Firebase function to create subscription and grant admin access
      const requestAdminAccess = httpsCallable(
        functions,
        "requestAdminAccessWithSubscription",
      );
      const result = await requestAdminAccess({
        paymentMethodId: paymentMethod.id,
        groupId: params.groupId,
        email,
        name,
        message: params.message,
      });

      if (result.data.success) {
        onSuccess(result.data.subscriptionId);
      } else {
        throw new Error(result.data.error || "Failed to create subscription");
      }
    } catch (err) {
      console.error("Subscription error:", err);
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormSection>
        {error && (
          <ErrorMessage>
            <span>⚠️</span>
            {error}
          </ErrorMessage>
        )}

        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={loading}
        />

        <Label htmlFor="name">Name on Card</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          disabled={loading}
        />

        <Label>Card Details</Label>
        <CardElementContainer>
          <CardElement options={cardElementOptions} />
        </CardElementContainer>

        <SubmitButton type="submit" disabled={!stripe || loading}>
          {loading ? (
            <>
              <Spinner />
              Processing...
            </>
          ) : (
            <>🔒 Subscribe - $12/year</>
          )}
        </SubmitButton>

        <CancelButton type="button" onClick={onCancel} disabled={loading}>
          Cancel and return to app
        </CancelButton>

        <SecureBadge>
          <span>🔐</span>
          Secured by Stripe • 256-bit encryption
        </SecureBadge>
      </FormSection>
    </form>
  );
}

// Success Component
function SuccessView({ subscriptionId, groupName, deepLinkUrl }) {
  // Try to redirect to app automatically
  useEffect(() => {
    // Post message for WebView
    if (window.ReactNativeBridge) {
      window.ReactNativeBridge.postSuccess(subscriptionId);
    }

    // Also try deep link after a short delay
    const timer = setTimeout(() => {
      window.location.href = deepLinkUrl;
    }, 2000);

    return () => clearTimeout(timer);
  }, [subscriptionId, deepLinkUrl]);

  return (
    <SuccessContainer>
      <SuccessIcon>✓</SuccessIcon>
      <SuccessTitle>Subscription Active!</SuccessTitle>
      <SuccessMessage>
        You're now an admin of <strong>{groupName}</strong>. Your subscription
        is active and you can start managing your group right away.
      </SuccessMessage>
      <ReturnButton href={deepLinkUrl}>Return to App</ReturnButton>
      <SecureBadge style={{ marginTop: "2rem" }}>
        Redirecting automatically...
      </SecureBadge>
    </SuccessContainer>
  );
}

// Loading Spinner for auth
const AuthLoadingSpinner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 0;

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e2e8f0;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  p {
    margin-top: 1rem;
    color: #718096;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

// Main Page Component
function SubscribePage() {
  const [searchParams] = useSearchParams();
  const [success, setSuccess] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Parse URL parameters from mobile app
  const authToken = searchParams.get("token");
  const params = {
    email: searchParams.get("email") || "",
    name: searchParams.get("name") || "",
    groupId: searchParams.get("groupId") || "",
    groupName: searchParams.get("groupName") || "Group",
    message: searchParams.get("message") || "",
    platform: searchParams.get("platform") || "unknown",
  };

  // Authenticate with custom token if provided
  const authenticateWithToken = useCallback(async () => {
    if (!authToken) {
      setAuthLoading(false);
      return;
    }

    try {
      await signInWithCustomToken(auth, authToken);
    } catch (err) {
      console.error("Custom token auth failed:", err);
    } finally {
      setAuthLoading(false);
    }
  }, [authToken]);

  // Attempt token auth on mount
  useEffect(() => {
    authenticateWithToken();
    logEvent(analytics, "subscription_view", { source: "claim_flow" });
  }, [authenticateWithToken]);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Deep link URLs for returning to app
  const getDeepLinkUrl = (status, subId = "") => {
    const base = "homegroups-app://payment";
    if (status === "success") {
      return `${base}-success?subscriptionId=${subId}&groupId=${params.groupId}`;
    } else if (status === "cancelled") {
      return `${base}-cancelled?groupId=${params.groupId}`;
    }
    return `${base}-error?groupId=${params.groupId}&error=${encodeURIComponent(
      status,
    )}`;
  };

  const handleSuccess = (subId) => {
    logEvent(analytics, "subscription_complete", {
      price_usd: 12,
      billing_period: "annual",
    });
    setSubscriptionId(subId);
    setSuccess(true);
  };

  const handleCancel = () => {
    // Post message for WebView
    if (window.ReactNativeBridge) {
      window.ReactNativeBridge.postCancel();
    }
    // Redirect via deep link
    window.location.href = getDeepLinkUrl("cancelled");
  };

  // Show loading while authenticating
  if (authLoading) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Become a Group Admin</Title>
          </Header>
          <AuthLoadingSpinner>
            <div className="spinner" />
            <p>Authenticating...</p>
          </AuthLoadingSpinner>
        </Card>
      </PageContainer>
    );
  }

  // Validate required params - need authenticated user and groupId
  if (!user || !params.groupId) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Invalid Request</Title>
            <Subtitle>
              {!user
                ? "Authentication required. Please access this page from the Homegroups app."
                : "Missing group information. Please return to the app and try again."}
            </Subtitle>
          </Header>
          <ReturnButton
            href="homegroups-app://"
            style={{ display: "block", textAlign: "center" }}
          >
            Open Homegroups App
          </ReturnButton>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Card>
        <Header>
          <Logo>🏠</Logo>
          <Title>{success ? "Welcome!" : "Become a Group Admin"}</Title>
          {!success && (
            <Subtitle>
              Subscribe to unlock group management features and help your
              recovery community thrive.
            </Subtitle>
          )}
        </Header>

        {!success && (
          <>
            <GroupInfo>
              <GroupName>{params.groupName}</GroupName>
              <GroupDetail>Group Admin Subscription</GroupDetail>
            </GroupInfo>

            <PriceSection>
              <PriceAmount>$12</PriceAmount>
              <PriceInterval>per year • Cancel anytime</PriceInterval>
            </PriceSection>
          </>
        )}

        {success ? (
          <SuccessView
            subscriptionId={subscriptionId}
            groupName={params.groupName}
            deepLinkUrl={getDeepLinkUrl("success", subscriptionId)}
          />
        ) : (
          <Elements stripe={stripePromise}>
            <CheckoutForm
              params={params}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </Elements>
        )}
      </Card>
    </PageContainer>
  );
}

export default SubscribePage;
