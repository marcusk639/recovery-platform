# Treatment Center Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable treatment centers to initiate a Stripe checkout directly from the existing `TreatmentCentersPage.js` pricing tiers, replacing the current lead-capture-only flow with an authenticated checkout path.

**Architecture:** The existing `createIntergroup` callable already supports `type: "treatment_center"` and returns a Stripe checkout URL. This plan wires the web pricing page's tier buttons to that callable. Because the web user must be authenticated to call a Firebase callable, we add an inline auth modal (reusing the pattern from `ClaimGroupPage.js`). On successful checkout, Stripe redirects to a new `/treatment-center-success` page. A `/treatment-center-cancel` page handles cancellations.

**Scope note:** The facility dashboard (showing alumni engagement) is out of scope for this plan — it depends on the Regroup integration being complete first (see `2026-05-21-meeting-attendance-api.md`). This plan delivers the checkout path only.

**Tech Stack:** React (web), Firebase Auth, Firebase callable (`createIntergroup`), Stripe Checkout, React Router v6.

---

## File Structure

| File                                          | Action | Responsibility                                                        |
| --------------------------------------------- | ------ | --------------------------------------------------------------------- |
| `web/src/pages/TreatmentCentersPage.js`       | Modify | Replace "Get Started" buttons with authenticated checkout flow        |
| `web/src/pages/TreatmentCenterSuccessPage.js` | Create | Post-checkout success redirect page                                   |
| `web/src/pages/TreatmentCenterCancelPage.js`  | Create | Post-checkout cancel page                                             |
| `web/src/App.js`                              | Modify | Add `/treatment-center-success` and `/treatment-center-cancel` routes |

---

### Task 1: Create the success and cancel pages

These are simple redirect/message pages, identical in structure to the existing `IntergroupSuccessPage.js` and `IntergroupCancelPage.js`.

**Files:**

- Create: `web/src/pages/TreatmentCenterSuccessPage.js`
- Create: `web/src/pages/TreatmentCenterCancelPage.js`

- [ ] **Step 1: Create TreatmentCenterSuccessPage.js**

```javascript
// web/src/pages/TreatmentCenterSuccessPage.js
import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

function TreatmentCenterSuccessPage() {
  const [searchParams] = useSearchParams();
  const intergroupId = searchParams.get("intergroupId");

  useEffect(() => {
    if (intergroupId) {
      window.location.href = `homegroups-app://intergroup-dashboard?intergroupId=${intergroupId}&status=success`;
    }
  }, [intergroupId]);

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
          <a href="mailto:support@homegroups-app.com" style={styles.link}>
            support@homegroups-app.com
          </a>
        </p>
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
```

- [ ] **Step 2: Create TreatmentCenterCancelPage.js**

```javascript
// web/src/pages/TreatmentCenterCancelPage.js
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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/TreatmentCenterSuccessPage.js web/src/pages/TreatmentCenterCancelPage.js
git commit -m "feat: add treatment center success and cancel pages"
```

---

### Task 2: Register routes in App.js

**Files:**

- Modify: `web/src/App.js`

- [ ] **Step 4: Add imports and routes**

Add two import lines near the top of `web/src/App.js`, after the existing intergroup page imports:

```javascript
import TreatmentCenterSuccessPage from "./pages/TreatmentCenterSuccessPage";
import TreatmentCenterCancelPage from "./pages/TreatmentCenterCancelPage";
```

Find the standalone routes block (alongside `/intergroup-success` and `/intergroup-cancel`):

```javascript
        <Route path="/intergroup-success" element={<IntergroupSuccessPage />} />
        <Route path="/intergroup-cancel" element={<IntergroupCancelPage />} />
```

Add below it:

```javascript
        <Route path="/treatment-center-success" element={<TreatmentCenterSuccessPage />} />
        <Route path="/treatment-center-cancel" element={<TreatmentCenterCancelPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add web/src/App.js
git commit -m "feat: register treatment center success/cancel routes"
```

---

### Task 3: Add authenticated checkout to TreatmentCentersPage

**Files:**

- Modify: `web/src/pages/TreatmentCentersPage.js`

- [ ] **Step 6: Read the current TreatmentCentersPage.js**

Open `web/src/pages/TreatmentCentersPage.js`. Find:

1. The existing imports at the top
2. The "Get Started" buttons in the pricing tier cards
3. How the existing lead form submission works

- [ ] **Step 7: Add firebase imports**

Add these imports at the top of `TreatmentCentersPage.js`, after any existing imports:

```javascript
import { useState } from "react";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";
```

- [ ] **Step 8: Add checkout state and handler**

Inside the `TreatmentCentersPage` component, add state and a checkout handler. Find the component function body and add:

```javascript
const [checkoutState, setCheckoutState] = useState(null);
// checkoutState: null | { tier: string, tierName: string, busy: boolean, error: string|null }
// When non-null, an inline auth modal is shown for the selected tier.

const handleGetStarted = (tier, tierName) => {
  setCheckoutState({ tier, tierName, busy: false, error: null });
};

const handleCheckout = async (email, password, isNewAccount) => {
  if (!checkoutState) return;
  setCheckoutState((s) => ({ ...s, busy: true, error: null }));
  try {
    // Ensure user is authenticated
    let user = auth.currentUser;
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

    // Call createIntergroup callable to get Stripe checkout URL
    const createIntergroup = httpsCallable(functions, "createIntergroup");
    const result = await createIntergroup({
      name: `${user.email} Treatment Center`,
      type: "treatment_center",
      tier: checkoutState.tier,
      successUrl: `https://homegroups-app.com/treatment-center-success`,
      cancelUrl: `https://homegroups-app.com/treatment-center-cancel`,
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
  setCheckoutState((s) => ({ ...s, busy: true, error: null }));
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    await handleCheckout(null, null, false);
  } catch (err) {
    setCheckoutState((s) => ({
      ...s,
      busy: false,
      error: err?.message ?? "Google sign-in failed.",
    }));
  }
};
```

- [ ] **Step 9: Replace "Get Started" button onClick handlers**

Find each pricing tier's "Get Started" button in the JSX. They currently have either no handler or navigate to the lead form. Replace their `onClick` with `handleGetStarted(tier, tierName)`:

- Basic tier button: `onClick={() => handleGetStarted("tier_a", "Basic Listing")}`
- Professional tier button: `onClick={() => handleGetStarted("tier_b", "Referral Partner")}`
- Enterprise tier button: keep as lead form (Enterprise requires custom contract — don't put it through automated checkout)

- [ ] **Step 10: Add the inline auth modal**

In the JSX `return`, add the auth modal conditional render. Place it at the very end of the component's returned JSX, before the closing wrapper tag:

```jsx
{
  checkoutState && (
    <div
      style={modalStyles.overlay}
      onClick={(e) => e.target === e.currentTarget && setCheckoutState(null)}
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
  );
}
```

- [ ] **Step 11: Add CheckoutEmailForm component and modal styles**

Add a small `CheckoutEmailForm` component (can be defined in the same file, above `TreatmentCentersPage`):

```javascript
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
```

- [ ] **Step 12: Commit**

```bash
git add web/src/pages/TreatmentCentersPage.js
git commit -m "feat: wire treatment center pricing tiers to Stripe checkout via createIntergroup callable"
```

---

## Acceptance Criteria

- [ ] Clicking "Get Started" on Basic or Professional tier opens an auth modal
- [ ] Signing in with Google or email/password then calls `createIntergroup` and redirects to Stripe checkout
- [ ] `/treatment-center-success` renders a confirmation page after payment
- [ ] `/treatment-center-cancel` renders a cancellation page with link back to pricing
- [ ] Enterprise "Get Started" continues to show the lead capture form (not automated checkout)
- [ ] Auth errors show friendly messages (not raw Firebase codes)
