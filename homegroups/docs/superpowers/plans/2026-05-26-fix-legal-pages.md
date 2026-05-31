# Fix Stale Legal Pages (D-12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `PrivacyPage.js` and `TermsPage.js` into compliance: update stale "January 1, 2023" dates, replace the fictional placeholder address ("123 Recovery Way, Suite 456, San Francisco, CA 94103"), and verify contact emails are real and monitored.

**Architecture:** Two files, each with two changes (date + address). No logic changes — pure content. A regression test guards both files against placeholder content re-appearing. Deploy via `firebase deploy --only hosting` from repo root.

**Tech Stack:** React (JSX), styled-components, `react-scripts test`, `firebase deploy --only hosting`

---

## Pre-Task: Gather Real Contact Info (Blocker — Do This First)

**These values must be real before the code change is committed:**

| Field                 | Current (fake)                                       | What you need                    |
| --------------------- | ---------------------------------------------------- | -------------------------------- |
| Last Updated date     | January 1, 2023                                      | Today's date (YYYY-MM-DD format) |
| Mailing address       | 123 Recovery Way, Suite 456, San Francisco, CA 94103 | Real address (see options below) |
| Privacy contact email | privacy@recoveryconnect.app                          | Verify this inbox is monitored   |
| General contact email | info@recoveryconnect.app                             | Verify this inbox is monitored   |

**Address options (choose one before coding):**

- **Option A — Registered agent service** (recommended for privacy): Northwest Registered Agent, Incfile, or similar services provide a professional mailing address for ~$100–125/yr. The address is stable even if you move.
- **Option B — P.O. Box**: Rent from USPS (~$300/yr for a business-size box) or a UPS Store (~$200–400/yr for street-address format like "Suite 123").
- **Option C — Actual business address**: Only use if you have a real office. Do not use a home address — it will be indexed publicly.

**The plan uses `[REAL_ADDRESS_LINE_1]`, `[CITY_STATE_ZIP]` as placeholders. Replace them before running any `git commit` step.**

---

## File Map

| File                           | Line    | Change              |
| ------------------------------ | ------- | ------------------- |
| `web/src/pages/PrivacyPage.js` | 168     | "Last Updated" date |
| `web/src/pages/PrivacyPage.js` | 439–445 | Mailing address     |
| `web/src/pages/TermsPage.js`   | 153     | "Last Updated" date |
| `web/src/pages/TermsPage.js`   | 364–370 | Mailing address     |

---

### Task 1: Write regression tests

Tests lock in real content and prevent placeholder text re-appearing in future edits.

**Files:**

- Create: `web/src/pages/__tests__/PrivacyPage.test.js`
- Create: `web/src/pages/__tests__/TermsPage.test.js`

- [ ] **Step 1.1: Create the Privacy page test**

Create `web/src/pages/__tests__/PrivacyPage.test.js`:

```javascript
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import PrivacyPage from "../PrivacyPage";

jest.mock("../../components/NewsletterSignup", () => () => (
  <div data-testid="newsletter" />
));

describe("PrivacyPage — content integrity", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
  });

  test("does not show the placeholder last-updated date", () => {
    expect(screen.queryByText(/January 1, 2023/i)).toBeNull();
  });

  test("does not contain the fictional placeholder address", () => {
    expect(screen.queryByText(/123 Recovery Way/i)).toBeNull();
    expect(screen.queryByText(/Suite 456/i)).toBeNull();
    expect(screen.queryByText(/San Francisco, CA 94103/i)).toBeNull();
  });

  test("shows a real last-updated date (2024 or later)", () => {
    // Last Updated must exist and be 2024 or later
    const lastUpdated = screen.getByText(/Last Updated:/i);
    expect(lastUpdated).toBeInTheDocument();
    // Extract year from the text and confirm it's >= 2024
    const year = parseInt(lastUpdated.textContent.match(/\d{4}/)?.[0], 10);
    expect(year).toBeGreaterThanOrEqual(2024);
  });
});
```

- [ ] **Step 1.2: Create the Terms page test**

Create `web/src/pages/__tests__/TermsPage.test.js`:

```javascript
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import TermsPage from "../TermsPage";

jest.mock("../../components/NewsletterSignup", () => () => (
  <div data-testid="newsletter" />
));

describe("TermsPage — content integrity", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
  });

  test("does not show the placeholder last-updated date", () => {
    expect(screen.queryByText(/January 1, 2023/i)).toBeNull();
  });

  test("does not contain the fictional placeholder address", () => {
    expect(screen.queryByText(/123 Recovery Way/i)).toBeNull();
    expect(screen.queryByText(/Suite 456/i)).toBeNull();
    expect(screen.queryByText(/San Francisco, CA 94103/i)).toBeNull();
  });

  test("shows a real last-updated date (2024 or later)", () => {
    const lastUpdated = screen.getByText(/Last Updated:/i);
    expect(lastUpdated).toBeInTheDocument();
    const year = parseInt(lastUpdated.textContent.match(/\d{4}/)?.[0], 10);
    expect(year).toBeGreaterThanOrEqual(2024);
  });
});
```

- [ ] **Step 1.3: Run the tests — verify they fail**

```bash
cd web
CI=true npm test -- --testPathPattern="PrivacyPage|TermsPage" --watchAll=false
```

Expected:

```
FAIL src/pages/__tests__/PrivacyPage.test.js
  ● does not show the placeholder last-updated date
    Expected element not to be present but found "Last Updated: January 1, 2023"
FAIL src/pages/__tests__/TermsPage.test.js
  ● does not show the placeholder last-updated date
    ...
```

- [ ] **Step 1.4: Commit the failing tests**

```bash
cd web
git add src/pages/__tests__/PrivacyPage.test.js src/pages/__tests__/TermsPage.test.js
git commit -m "test(legal): add regression tests for placeholder content in Privacy/Terms"
```

---

### Task 2: Update PrivacyPage.js

**Files:**

- Modify: `web/src/pages/PrivacyPage.js`

**Pre-check:** Before editing, confirm you have the real address. Substitute `[REAL_ADDRESS_LINE_1]` and `[CITY_STATE_ZIP]` with actual values.

- [ ] **Step 2.1: Update "Last Updated" date**

In `web/src/pages/PrivacyPage.js`, find line ~168:

```javascript
<LastUpdated>Last Updated: January 1, 2023</LastUpdated>
```

Replace with (use today's actual date):

```javascript
<LastUpdated>Last Updated: May 26, 2026</LastUpdated>
```

- [ ] **Step 2.2: Update the mailing address**

Find lines ~438–446 in `web/src/pages/PrivacyPage.js`:

```javascript
<ContactParagraph>
  <Emphasis>By Mail:</Emphasis> Homegroups, Inc.
  <br />
  123 Recovery Way, Suite 456
  <br />
  San Francisco, CA 94103
  <br />
  United States
</ContactParagraph>
```

Replace with your actual address (example shown — substitute real values):

```javascript
<ContactParagraph>
  <Emphasis>By Mail:</Emphasis> Homegroups
  <br />
  [REAL_ADDRESS_LINE_1]
  <br />
  [CITY_STATE_ZIP]
  <br />
  United States
</ContactParagraph>
```

Note: If you are a sole proprietor without a registered entity, remove "Inc." — do not use a corporate suffix you haven't filed.

---

### Task 3: Update TermsPage.js

**Files:**

- Modify: `web/src/pages/TermsPage.js`

- [ ] **Step 3.1: Update "Last Updated" date**

In `web/src/pages/TermsPage.js`, find line ~153:

```javascript
<LastUpdated>Last Updated: January 1, 2023</LastUpdated>
```

Replace with the same date used in PrivacyPage.js:

```javascript
<LastUpdated>Last Updated: May 26, 2026</LastUpdated>
```

- [ ] **Step 3.2: Update the mailing address**

Find lines ~362–372 in `web/src/pages/TermsPage.js`:

```javascript
<ContactParagraph>
  <Emphasis>By Mail:</Emphasis> Homegroups, Inc.
  <br />
  123 Recovery Way, Suite 456
  <br />
  San Francisco, CA 94103
  <br />
  United States
</ContactParagraph>
```

Replace with the same real address used in PrivacyPage.js:

```javascript
<ContactParagraph>
  <Emphasis>By Mail:</Emphasis> Homegroups
  <br />
  [REAL_ADDRESS_LINE_1]
  <br />
  [CITY_STATE_ZIP]
  <br />
  United States
</ContactParagraph>
```

---

### Task 4: Run all tests and verify the build

- [ ] **Step 4.1: Run the legal page tests — all should pass**

```bash
cd web
CI=true npm test -- --testPathPattern="PrivacyPage|TermsPage" --watchAll=false
```

Expected: 6 tests across 2 suites, all PASS.

- [ ] **Step 4.2: Verify the web build compiles**

```bash
cd web
npm run build 2>&1 | tail -5
```

Expected: `The build folder is ready to be deployed.`

- [ ] **Step 4.3: Commit**

```bash
cd web
git add src/pages/PrivacyPage.js src/pages/TermsPage.js
git commit -m "fix(legal): update Privacy/Terms dates and replace placeholder address (D-12)

Updates 'Last Updated' from Jan 1, 2023 to May 26, 2026 in both
Privacy Policy and Terms of Service pages.

Replaces fictional '123 Recovery Way, Suite 456, San Francisco, CA 94103'
placeholder with real business address. Removes erroneous 'Inc.' suffix
(not a registered corporation).

Closes D-12."
```

---

### Task 5: Deploy and manually verify

- [ ] **Step 5.1: Deploy to Firebase Hosting**

```bash
# From repo root (not web/)
firebase deploy --only hosting
```

- [ ] **Step 5.2: Verify deployed pages**

Open in browser (incognito to skip cache):

- https://recovery-connect-cad4b.web.app/privacy
  - [ ] "Last Updated: May 26, 2026" visible
  - [ ] No "123 Recovery Way" anywhere on the page
  - [ ] Real address shown in contact section
- https://recovery-connect-cad4b.web.app/terms
  - [ ] "Last Updated: May 26, 2026" visible
  - [ ] No "123 Recovery Way" anywhere on the page
  - [ ] Real address shown in contact section

- [ ] **Step 5.3: Verify contact emails work**

Send a test email to `privacy@recoveryconnect.app` and `info@recoveryconnect.app`. Confirm you receive them. If these inboxes aren't set up, configure them via your email provider before this plan is complete.

---

## Note on Legal Review

These pages were written in 2023 and cover the basics for a mobile app with subscription payments. Before scaling past ~500 users, consider having an attorney review both documents for:

- CCPA compliance (California Consumer Privacy Act — you have California users)
- COPPA compliance (under-13 users — verify your onboarding screens block minors)
- Apple App Store privacy manifest requirements (required for all App Store submissions as of 2024)
- Stripe's requirement to link to your privacy policy from the checkout page
