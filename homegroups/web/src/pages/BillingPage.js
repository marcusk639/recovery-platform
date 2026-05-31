import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  onAuthStateChanged,
  signInWithCustomToken,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { app, auth, db } from "../lib/firebase";
import styled from "styled-components";

// Initialize Firebase Functions
const functions = getFunctions(app);

// Key for storing email in localStorage (needed to complete email link sign-in)
const EMAIL_FOR_SIGN_IN_KEY = "emailForSignIn";

// Action code settings for email link sign-in
const getActionCodeSettings = (groupId) => ({
  // URL to redirect back to after clicking email link
  url: `${window.location.origin}/billing${
    groupId ? `?groupId=${groupId}` : ""
  }`,
  handleCodeInApp: true,
});

// Styled Components
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
    max-width: 500px;
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

const Section = styled.div`
  background: #f7fafc;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  border: 1px solid #e2e8f0;
`;

const SectionTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: #718096;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e2e8f0;

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  color: #4a5568;
  font-size: 0.95rem;
`;

const InfoValue = styled.span`
  color: #1a202c;
  font-weight: 600;
  font-size: 0.95rem;
`;

const StatusBadge = styled.span`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${(props) => {
    switch (props.status) {
      case "active":
        return "#c6f6d5";
      case "trialing":
        return "#bee3f8";
      case "past_due":
        return "#fed7d7";
      case "canceled":
        return "#e2e8f0";
      default:
        return "#e2e8f0";
    }
  }};
  color: ${(props) => {
    switch (props.status) {
      case "active":
        return "#22543d";
      case "trialing":
        return "#2c5282";
      case "past_due":
        return "#c53030";
      case "canceled":
        return "#718096";
      default:
        return "#718096";
    }
  }};
`;

const Button = styled.button`
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
  margin-bottom: 0.75rem;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.a`
  display: block;
  width: 100%;
  padding: 0.875rem;
  background: transparent;
  color: #667eea;
  border: 2px solid #667eea;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(102, 126, 234, 0.1);
  }
`;

const ErrorMessage = styled.div`
  background: #fed7d7;
  color: #c53030;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
`;

const LoadingSpinner = styled.div`
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

const GroupSelector = styled.select`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1.5rem;
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #667eea;
  }
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

const SuccessMessage = styled.div`
  background: #c6f6d5;
  color: #22543d;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  text-align: center;

  h3 {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  p {
    font-size: 0.875rem;
    opacity: 0.9;
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  margin: 1.5rem 0;

  &::before,
  &::after {
    content: "";
    flex: 1;
    border-bottom: 1px solid #e2e8f0;
  }

  span {
    padding: 0 1rem;
    color: #a0aec0;
    font-size: 0.875rem;
  }
`;

function BillingPage() {
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(
    searchParams.get("groupId") || ""
  );
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [redirecting, setRedirecting] = useState(false);

  // Email sign-in state
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  // Get token from URL params (passed from mobile app)
  const authToken = searchParams.get("token");

  // Handle email link sign-in (when user clicks link in email)
  const handleEmailLinkSignIn = useCallback(async () => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      // Get email from localStorage
      const emailForSignIn = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);

      if (!emailForSignIn) {
        // If email is not in localStorage (different device/browser),
        // show a proper form instead of ugly browser prompt
        setNeedsEmailConfirmation(true);
        setAuthLoading(false);
        return;
      }

      await completeEmailSignIn(emailForSignIn);
    }
    setAuthLoading(false);
  }, []);

  // Complete email sign-in with provided email
  const completeEmailSignIn = async (emailForSignIn) => {
    try {
      setConfirmingEmail(true);
      console.log("Completing email link sign-in...");
      await signInWithEmailLink(auth, emailForSignIn, window.location.href);
      // Clear the email from storage
      window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
      // Clean up URL (remove sign-in params)
      const cleanUrl = window.location.origin + window.location.pathname;
      const groupId = searchParams.get("groupId");
      window.history.replaceState(
        {},
        document.title,
        groupId ? `${cleanUrl}?groupId=${groupId}` : cleanUrl
      );
      setNeedsEmailConfirmation(false);
      console.log("Email link sign-in successful");
    } catch (err) {
      console.error("Email link sign-in failed:", err);
      setNeedsEmailConfirmation(false);
      if (err.code === "auth/invalid-action-code") {
        setError(
          "This sign-in link has already been used or has expired. Please request a new one."
        );
      } else if (err.code === "auth/invalid-email") {
        setError("The email address doesn't match. Please try again.");
      } else {
        setError("Sign-in failed. Please request a new sign-in link.");
      }
    } finally {
      setConfirmingEmail(false);
    }
  };

  // Handle email confirmation form submission
  const handleConfirmEmail = async (e) => {
    e.preventDefault();
    if (!email) return;
    await completeEmailSignIn(email);
  };

  // Authenticate with custom token if provided
  const authenticateWithToken = useCallback(async () => {
    if (!authToken) {
      // Check if this is an email link sign-in
      await handleEmailLinkSignIn();
      return;
    }

    try {
      console.log("Authenticating with custom token...");
      await signInWithCustomToken(auth, authToken);
      console.log("Custom token auth successful");
    } catch (err) {
      console.error("Custom token auth failed:", err);
      setError(
        "Authentication failed. Please return to the app and try again."
      );
    } finally {
      setAuthLoading(false);
    }
  }, [authToken, handleEmailLinkSignIn]);

  // Attempt token auth on mount
  useEffect(() => {
    authenticateWithToken();
  }, [authenticateWithToken]);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser && !authLoading) {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [authLoading]);

  // Send email sign-in link
  const handleSendSignInLink = async (e) => {
    e.preventDefault();
    if (!email) return;

    setSendingEmail(true);
    setError(null);

    try {
      const actionCodeSettings = getActionCodeSettings(selectedGroupId);
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save email to localStorage for sign-in completion
      window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
      setEmailSent(true);
      console.log("Sign-in link sent to:", email);
    } catch (err) {
      console.error("Error sending sign-in link:", err);
      if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Failed to send sign-in link. Please try again.");
      }
    } finally {
      setSendingEmail(false);
    }
  };

  // Fetch groups where user is admin
  useEffect(() => {
    async function fetchAdminGroups() {
      if (!user) return;

      try {
        const groupsRef = collection(db, "groups");
        const q = query(groupsRef, where("admins", "array-contains", user.uid));
        const snapshot = await getDocs(q);

        const adminGroups = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setGroups(adminGroups);

        // If no group selected but we have groups, select the first one
        if (!selectedGroupId && adminGroups.length > 0) {
          setSelectedGroupId(adminGroups[0].id);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error fetching groups:", err);
        setError("Failed to load your groups.");
        setLoading(false);
      }
    }

    fetchAdminGroups();
  }, [user, selectedGroupId]);

  // Fetch subscription info for selected group
  useEffect(() => {
    async function fetchSubscriptionInfo() {
      if (!selectedGroupId || !user) return;

      try {
        const getSubscriptionInfo = httpsCallable(
          functions,
          "getGroupSubscriptionInfo"
        );
        const result = await getSubscriptionInfo({ groupId: selectedGroupId });
        setSubscriptionInfo(result.data);
      } catch (err) {
        console.error("Error fetching subscription info:", err);
        // Don't show error - might be a group without subscription
        setSubscriptionInfo(null);
      }
    }

    fetchSubscriptionInfo();
  }, [selectedGroupId, user]);

  const handleManageBilling = async () => {
    if (!selectedGroupId) return;

    setRedirecting(true);
    setError(null);

    try {
      const createPortalSession = httpsCallable(
        functions,
        "createCustomerPortalSession"
      );
      const result = await createPortalSession({ groupId: selectedGroupId });

      if (result.data.success && result.data.url) {
        window.location.href = result.data.url;
      } else {
        throw new Error("Failed to create billing portal session");
      }
    } catch (err) {
      console.error("Error creating portal session:", err);
      setError(
        err.message || "Failed to open billing portal. Please try again."
      );
      setRedirecting(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!selectedGroupId) return;

    setRedirecting(true);
    setError(null);

    try {
      const reactivate = httpsCallable(
        functions,
        "reactivateGroupSubscription"
      );
      const result = await reactivate({ groupId: selectedGroupId });

      if (result.data.success) {
        // Refresh subscription info
        const getSubscriptionInfo = httpsCallable(
          functions,
          "getGroupSubscriptionInfo"
        );
        const infoResult = await getSubscriptionInfo({
          groupId: selectedGroupId,
        });
        setSubscriptionInfo(infoResult.data);
        setError(null);
        alert("Subscription reactivated successfully!");
      } else {
        throw new Error("Failed to reactivate subscription");
      }
    } catch (err) {
      console.error("Error reactivating subscription:", err);
      // If reactivation fails because no payment method, redirect to portal
      if (err.message?.includes("payment method")) {
        setError(
          "Please add a payment method first. Redirecting to billing portal..."
        );
        setTimeout(() => handleManageBilling(), 2000);
      } else {
        setError(
          err.message || "Failed to reactivate subscription. Please try again."
        );
      }
    } finally {
      setRedirecting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.seconds
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "active":
        return "Active";
      case "trialing":
        return "Trial";
      case "past_due":
        return "Past Due";
      case "canceled":
        return "Canceled";
      default:
        return status || "Unknown";
    }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  // Still authenticating with token
  if (authLoading) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Billing</Title>
          </Header>
          <LoadingSpinner>
            <div className="spinner" />
            <p>Authenticating...</p>
          </LoadingSpinner>
        </Card>
      </PageContainer>
    );
  }

  // Email confirmation needed (clicked link on different device)
  if (needsEmailConfirmation) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Confirm Your Email</Title>
            <Subtitle>
              To complete sign-in, please enter the email address you used to
              request the sign-in link.
            </Subtitle>
          </Header>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <form onSubmit={handleConfirmEmail}>
            <Input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={confirmingEmail}
              required
              autoFocus
            />
            <Button type="submit" disabled={confirmingEmail || !email}>
              {confirmingEmail ? "Signing in..." : "Confirm & Sign In"}
            </Button>
          </form>

          <Divider>
            <span>or</span>
          </Divider>

          <SecondaryButton href="homegroups-app://billing">
            Open Homegroups App
          </SecondaryButton>
        </Card>
      </PageContainer>
    );
  }

  // Not logged in (no token provided or token auth failed)
  if (!loading && !user) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Sign In to Manage Billing</Title>
            <Subtitle>
              Enter your email to receive a secure sign-in link.
            </Subtitle>
          </Header>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          {emailSent ? (
            <SuccessMessage>
              <h3>✉️ Check Your Email</h3>
              <p>
                We sent a sign-in link to <strong>{email}</strong>. Click the
                link in the email to access your billing.
              </p>
            </SuccessMessage>
          ) : (
            <form onSubmit={handleSendSignInLink}>
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sendingEmail}
                required
              />
              <Button type="submit" disabled={sendingEmail || !email}>
                {sendingEmail ? "Sending..." : "Send Sign-In Link"}
              </Button>
            </form>
          )}

          <Divider>
            <span>or</span>
          </Divider>

          <SecondaryButton href="homegroups-app://billing">
            Open Homegroups App
          </SecondaryButton>
        </Card>
      </PageContainer>
    );
  }

  // Loading groups/subscription data
  if (loading) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>Billing</Title>
          </Header>
          <LoadingSpinner>
            <div className="spinner" />
            <p>Loading your billing information...</p>
          </LoadingSpinner>
        </Card>
      </PageContainer>
    );
  }

  // No groups
  if (groups.length === 0) {
    return (
      <PageContainer>
        <Card>
          <Header>
            <Logo>🏠</Logo>
            <Title>No Groups Found</Title>
            <Subtitle>
              You are not an admin of any groups. Become a group admin to manage
              billing.
            </Subtitle>
          </Header>
          <SecondaryButton href="homegroups-app://">
            Return to App
          </SecondaryButton>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Card>
        <Header>
          <Logo>🏠</Logo>
          <Title>Billing Management</Title>
          <Subtitle>Manage your group subscription and billing</Subtitle>
        </Header>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {/* Group Selector (if multiple groups) */}
        {groups.length > 1 && (
          <GroupSelector
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </GroupSelector>
        )}

        {/* Group Info */}
        {selectedGroup && (
          <Section>
            <SectionTitle>Group</SectionTitle>
            <InfoRow>
              <InfoLabel>Name</InfoLabel>
              <InfoValue>{selectedGroup.name}</InfoValue>
            </InfoRow>
            <InfoRow>
              <InfoLabel>Members</InfoLabel>
              <InfoValue>{selectedGroup.memberCount || 0}</InfoValue>
            </InfoRow>
          </Section>
        )}

        {/* Subscription Info */}
        <Section>
          <SectionTitle>Subscription</SectionTitle>
          {subscriptionInfo ? (
            <>
              <InfoRow>
                <InfoLabel>Status</InfoLabel>
                <StatusBadge status={subscriptionInfo.subscriptionStatus}>
                  {getStatusLabel(subscriptionInfo.subscriptionStatus)}
                </StatusBadge>
              </InfoRow>
              <InfoRow>
                <InfoLabel>Plan</InfoLabel>
                <InfoValue>$12/year</InfoValue>
              </InfoRow>
              {subscriptionInfo.subscriptionDetails?.currentPeriodEnd && (
                <InfoRow>
                  <InfoLabel>
                    {subscriptionInfo.subscriptionStatus === "trialing"
                      ? "Trial Ends"
                      : "Next Billing Date"}
                  </InfoLabel>
                  <InfoValue>
                    {formatDate(
                      subscriptionInfo.subscriptionDetails.currentPeriodEnd
                    )}
                  </InfoValue>
                </InfoRow>
              )}
            </>
          ) : (
            <InfoRow>
              <InfoLabel>Status</InfoLabel>
              <InfoValue>No active subscription</InfoValue>
            </InfoRow>
          )}
        </Section>

        {/* Actions */}
        {(() => {
          const status = subscriptionInfo?.subscriptionStatus;

          // Active, trialing, or past_due - show Manage Billing
          if (
            status === "active" ||
            status === "trialing" ||
            status === "past_due" ||
            status === "incomplete"
          ) {
            return (
              <Button onClick={handleManageBilling} disabled={redirecting}>
                {redirecting ? "Redirecting..." : "Manage Billing"}
              </Button>
            );
          }

          // Canceled but has customer - can reactivate
          if (status === "canceled" && subscriptionInfo?.customerDetails) {
            return (
              <Button
                onClick={handleReactivateSubscription}
                disabled={redirecting}
              >
                {redirecting ? "Processing..." : "Reactivate Subscription"}
              </Button>
            );
          }

          // No subscription at all - need to subscribe via app
          // (Web can't create new subscriptions without proper auth token flow)
          return (
            <SecondaryButton href="homegroups-app://subscribe">
              Subscribe via App
            </SecondaryButton>
          );
        })()}

        <SecondaryButton href="homegroups-app://" style={{ marginTop: "1rem" }}>
          Return to App
        </SecondaryButton>
      </Card>
    </PageContainer>
  );
}

export default BillingPage;
