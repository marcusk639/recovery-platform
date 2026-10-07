import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const INTERGROUP_ID_PATTERN = /^[a-zA-Z0-9]{10,30}$/;

function TreatmentCenterSuccessPage() {
  const [searchParams] = useSearchParams();
  const intergroupId = searchParams.get("intergroupId");
  const isValidId =
    intergroupId != null && INTERGROUP_ID_PATTERN.test(intergroupId);

  useEffect(() => {
    if (isValidId) {
      window.location.href = `homegroups-app://intergroup-dashboard?intergroupId=${encodeURIComponent(intergroupId)}&status=success`;
    }
  }, [intergroupId, isValidId]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.checkmark}>✓</div>
        <h1 style={styles.title}>Welcome Aboard</h1>
        <p style={styles.message}>
          Your treatment center account is being set up. You'll receive a
          confirmation email within a few minutes with next steps.
        </p>
        <p style={styles.note}>
          Questions? Email{" "}
          <a href="mailto:admin@homegroups-app.com" style={styles.link}>
            admin@homegroups-app.com
          </a>
        </p>
        {isValidId && (
          <div style={{ marginTop: "1.5rem" }}>
            <a
              href={`/facility-dashboard?intergroupId=${encodeURIComponent(intergroupId)}`}
              style={styles.link}
            >
              View your facility dashboard →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    backgroundColor: "#f8f9fa",
  },
  card: {
    textAlign: "center",
    maxWidth: "480px",
    padding: "2.5rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },
  checkmark: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
    fontSize: "1.75rem",
    lineHeight: "56px",
    margin: "0 auto 1.5rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: "700",
    color: "#212121",
    marginBottom: "0.75rem",
  },
  message: {
    fontSize: "1rem",
    color: "#555",
    lineHeight: "1.6",
    marginBottom: "1.5rem",
  },
  note: { fontSize: "0.875rem", color: "#9E9E9E" },
  link: { color: "#2196F3", textDecoration: "none" },
};

export default TreatmentCenterSuccessPage;
