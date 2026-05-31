import React from "react";
import { Link } from "react-router-dom";

function TreatmentCenterCancelPage() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.icon}>×</div>
        <h1 style={styles.title}>Setup Cancelled</h1>
        <p style={styles.message}>
          Your treatment center account was not created. No charge was made.
        </p>
        <Link to="/for-treatment-centers" style={styles.link}>
          Return to pricing
        </Link>
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
    maxWidth: "400px",
    padding: "2rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },
  icon: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#FFF3E0",
    color: "#E65100",
    fontSize: "1.75rem",
    lineHeight: "48px",
    margin: "0 auto 1.5rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "600",
    color: "#212121",
    marginBottom: "0.5rem",
  },
  message: { fontSize: "1rem", color: "#757575", marginBottom: "1.5rem" },
  link: {
    display: "inline-block",
    color: "#2196F3",
    textDecoration: "none",
    fontWeight: "500",
  },
};

export default TreatmentCenterCancelPage;
