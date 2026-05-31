import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

function StripeRedirectPage() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get("groupId");
  const type = searchParams.get("type");

  useEffect(() => {
    // Redirect to the app's deep link
    const deepLink = `homegroups-app://group-overview?groupId=${groupId}&stripeStatus=${type}`;
    window.location.href = deepLink;
  }, [groupId, type]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner}></div>
        <h1 style={styles.title}>Redirecting to App...</h1>
        <p style={styles.message}>
          {type === "return"
            ? "Stripe setup complete! Taking you back to the app."
            : "Returning to the app to continue setup."}
        </p>
        <p style={styles.fallback}>
          If you're not redirected automatically,{" "}
          <a
            href={`homegroups-app://group-overview?groupId=${groupId}&stripeStatus=${type}`}
            style={styles.link}
          >
            tap here to open the app
          </a>
          .
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
  spinner: {
    width: "48px",
    height: "48px",
    border: "4px solid #E3F2FD",
    borderTop: "4px solid #2196F3",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
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
  fallback: {
    fontSize: "0.875rem",
    color: "#9E9E9E",
  },
  link: {
    color: "#2196F3",
    textDecoration: "none",
    fontWeight: "500",
  },
};

// Add CSS animation for spinner
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default StripeRedirectPage;
