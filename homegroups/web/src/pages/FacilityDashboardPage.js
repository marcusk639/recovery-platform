import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";

const INTERGROUP_ID_PATTERN = /^[a-zA-Z0-9]{10,30}$/;
const getFacilityEngagementMetrics = httpsCallable(
  functions,
  "getFacilityEngagementMetrics",
);

export default function FacilityDashboardPage() {
  const [searchParams] = useSearchParams();
  const intergroupId = searchParams.get("intergroupId") ?? "";
  const isValidId = INTERGROUP_ID_PATTERN.test(intergroupId);

  const [authState, setAuthState] = useState("loading"); // "loading" | "signed-out" | "signed-in"
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? "signed-in" : "signed-out");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (authState !== "signed-in" || !isValidId) return;

    setMetricsLoading(true);
    setMetricsError(null);

    getFacilityEngagementMetrics({ intergroupId })
      .then(({ data }) => setMetrics(data))
      .catch((err) => {
        let msg = "Failed to load data.";
        if (err.code === "unauthenticated")
          msg = "Session expired. Please sign in again.";
        else if (err.code === "permission-denied")
          msg = "You don't have access to this facility.";
        else if (err.code === "not-found") msg = "Facility not found.";
        else if (err.code === "failed-precondition")
          msg = "Facility subscription is not active.";
        else if (err.message) msg = err.message;
        setMetricsError(msg);
      })
      .finally(() => setMetricsLoading(false));
  }, [authState, intergroupId, isValidId]);

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const cancelled =
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request";
      setSignInError(
        cancelled
          ? "Sign-in cancelled. Please try again."
          : "Google sign-in failed. Try email/password instead.",
      );
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setSignInError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setSignInError("Invalid email or password.");
    }
  };

  if (!isValidId) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <p style={s.errorText}>Invalid or missing facility ID.</p>
        </div>
      </div>
    );
  }

  if (authState === "loading") {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <p style={s.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "signed-out") {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h1 style={s.title}>Facility Dashboard</h1>
          <p style={s.subtitle}>Sign in to view your alumni engagement data.</p>
          <button onClick={handleGoogleSignIn} style={s.googleBtn}>
            Sign in with Google
          </button>
          <div style={s.divider}>or</div>
          <form onSubmit={handleEmailSignIn}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={s.input}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={s.input}
              required
            />
            <button type="submit" style={s.primaryBtn}>
              Sign In
            </button>
          </form>
          {signInError && <p style={s.errorText}>{signInError}</p>}
        </div>
      </div>
    );
  }

  // Signed in — show dashboard
  return (
    <div style={s.container}>
      <div style={{ ...s.card, maxWidth: 720, textAlign: "left" }}>
        <h1 style={s.title}>Alumni Engagement</h1>
        <p style={s.muted}>
          {metrics
            ? `${metrics.affiliatedGroupCount} affiliated group${metrics.affiliatedGroupCount !== 1 ? "s" : ""} · Updated ${new Date(metrics.computedAt).toLocaleTimeString()}`
            : " "}
        </p>

        {metricsLoading && <p style={s.muted}>Loading data…</p>}
        {metricsError && <p style={s.errorText}>{metricsError}</p>}

        {metrics && (
          <div style={s.grid}>
            <MetricCard title="Meetings Attended">
              <Stat label="Last 7 days" value={metrics.meetings.last7Days} />
              <Stat label="Last 30 days" value={metrics.meetings.last30Days} />
            </MetricCard>

            <MetricCard title="Sobriety Milestones">
              <Stat label="30-day chips" value={metrics.milestones.thirtyDay} />
              <Stat label="60-day chips" value={metrics.milestones.sixtyDay} />
              <Stat label="90-day chips" value={metrics.milestones.ninetyDay} />
              <Stat
                label="180-day chips"
                value={metrics.milestones.oneEightyDay}
              />
            </MetricCard>

            <MetricCard title="Sponsorship Connections">
              <Stat
                label="Alumni with sponsors"
                value={metrics.sponsorships.total}
              />
              <p
                style={{ ...s.muted, fontSize: "0.8rem", marginTop: "0.5rem" }}
              >
                All data is anonymized. No names or personal information are
                shown.
              </p>
            </MetricCard>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, children }) {
  return (
    <div style={s.metricCard}>
      <h2 style={s.cardTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value ?? "—"}</span>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    backgroundColor: "#f8f9fa",
  },
  card: {
    maxWidth: 480,
    width: "100%",
    padding: "2.5rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#212121",
    marginBottom: "0.5rem",
  },
  subtitle: { color: "#555", marginBottom: "1.5rem" },
  muted: { color: "#9E9E9E", fontSize: "0.875rem" },
  errorText: { color: "#c62828", fontSize: "0.9rem", marginTop: "1rem" },
  googleBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 500,
    marginBottom: "1rem",
  },
  divider: { color: "#9E9E9E", margin: "0.75rem 0", fontSize: "0.875rem" },
  input: {
    display: "block",
    width: "100%",
    padding: "0.65rem 0.75rem",
    marginBottom: "0.75rem",
    borderRadius: "6px",
    border: "1px solid #ddd",
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    background: "#2196F3",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1.25rem",
    marginTop: "1.5rem",
  },
  metricCard: {
    background: "#f8f9fa",
    borderRadius: "8px",
    padding: "1.25rem",
  },
  cardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#424242",
    marginBottom: "0.75rem",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.4rem",
  },
  statLabel: { color: "#757575", fontSize: "0.875rem" },
  statValue: { fontWeight: 700, fontSize: "1.1rem", color: "#212121" },
};
