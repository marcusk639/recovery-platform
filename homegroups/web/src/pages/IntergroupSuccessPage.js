import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

const INTERGROUP_ID_PATTERN = /^[a-zA-Z0-9]{10,30}$/;

function IntergroupSuccessPage() {
  const [searchParams] = useSearchParams();
  const intergroupId = searchParams.get("intergroupId");
  const isValidId =
    intergroupId != null && INTERGROUP_ID_PATTERN.test(intergroupId);

  const deepLinkUrl = useMemo(
    () =>
      isValidId
        ? `homegroups-app://intergroup-dashboard?intergroupId=${encodeURIComponent(intergroupId)}&status=success`
        : null,
    [intergroupId, isValidId],
  );

  const handleOpenApp = () => {
    if (deepLinkUrl) {
      window.location.href = deepLinkUrl;
    }
  };

  // Secondary: auto-attempt after a short delay. iOS Safari may block this
  // because it lacks a user gesture, so the primary CTA above is the
  // reliable path for those users.
  useEffect(() => {
    if (!deepLinkUrl) return undefined;
    const timer = setTimeout(() => {
      window.location.href = deepLinkUrl;
    }, 1500);
    return () => clearTimeout(timer);
  }, [deepLinkUrl]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.checkmark}>✓</div>
        <h1 style={styles.title}>Payment Successful</h1>
        <p style={styles.message}>Your intergroup subscription is active.</p>
        <button
          type="button"
          onClick={handleOpenApp}
          disabled={!deepLinkUrl}
          style={{
            ...styles.primaryButton,
            ...(deepLinkUrl ? {} : styles.primaryButtonDisabled),
          }}
        >
          Open in RecoveryConnect App
        </button>
        <p style={styles.fallback}>
          If the app doesn't open automatically, tap the button above.
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "60vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
  },
  card: {
    textAlign: "center",
    maxWidth: "400px",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
  },
  checkmark: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
    fontSize: "1.5rem",
    lineHeight: "48px",
    margin: "0 auto 1.5rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#212121",
    marginBottom: "0.5rem",
  },
  message: {
    fontSize: "1rem",
    color: "#757575",
    marginBottom: "1.5rem",
  },
  primaryButton: {
    display: "inline-block",
    width: "100%",
    padding: "0.85rem 1rem",
    backgroundColor: "#2196F3",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "1rem",
    boxShadow: "0 2px 6px rgba(33, 150, 243, 0.25)",
  },
  primaryButtonDisabled: {
    backgroundColor: "#BDBDBD",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  fallback: {
    fontSize: "0.875rem",
    color: "#9E9E9E",
  },
};

export default IntergroupSuccessPage;
