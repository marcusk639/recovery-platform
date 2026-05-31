# Fix Fictional Founder Bios (D-11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three fabricated founder bios ("James Wilson", "Sarah Chen", "Michael Davis") in `web/src/pages/AboutPage.js` with honest content — removing FTC exposure and aligning the page with 12-step anonymity culture.

**Architecture:** All changes are confined to `web/src/pages/AboutPage.js`. The `teamMembers` data array, the "Our Story" prose, and the timeline entries all contain fabricated names/stats that need to be replaced. No component or routing changes required. The approach embraces 12-step anonymity: replace the three fictional team members with one honest founder card using a first-name-only format, and scrub fabricated stats from the timeline.

**Tech Stack:** React (JSX), styled-components, `react-scripts test` (CRA), `npm run build` (web build)

---

## Pre-Task: Understand the FTC Risk

The FTC Act §5 prohibits material deceptions — presenting fictional employees as real founders is a deceptive business practice. For a product serving a trust-critical community (recovery), this is especially damaging if discovered by users. The fix is simple: be honest.

**12-step anonymity angle:** Per Tradition Twelve ("anonymity is the spiritual foundation of all our traditions"), recovery community members are accustomed to first-name-only introductions. "Built by Marcus, a member" is more culturally resonant than a corporate bio page.

**Before starting:** Fill in the founder's real first name and a short honest bio. The plan uses `Marcus` as a placeholder — replace with actual info.

---

## File Map

| File                         | Action | What changes                                    |
| ---------------------------- | ------ | ----------------------------------------------- |
| `web/src/pages/AboutPage.js` | Modify | `teamMembers` array, story prose, timeline data |

---

### Task 1: Write the snapshot regression test

A snapshot test will lock in the fixed content so it can never accidentally regress back to "James Wilson" or fake stats.

**Files:**

- Create: `web/src/pages/__tests__/AboutPage.test.js`

- [ ] **Step 1.1: Install testing dependencies (if missing)**

```bash
cd web
npm ls @testing-library/react 2>/dev/null | grep @testing-library || npm install --save-dev @testing-library/react @testing-library/jest-dom
```

Expected: no error.

- [ ] **Step 1.2: Write the failing test**

Create `web/src/pages/__tests__/AboutPage.test.js`:

```javascript
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AboutPage from "../AboutPage";

// Mock framer-motion and react-intersection-observer to avoid animation state issues
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));
jest.mock("react-intersection-observer", () => ({
  useInView: () => [null, true],
}));
jest.mock("../../components/NewsletterSignup", () => () => (
  <div data-testid="newsletter" />
));

describe("AboutPage — content integrity", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
  });

  test("does not contain fictional team member names", () => {
    expect(screen.queryByText(/James Wilson/i)).toBeNull();
    expect(screen.queryByText(/Sarah Chen/i)).toBeNull();
    expect(screen.queryByText(/Michael Davis/i)).toBeNull();
  });

  test("does not contain fabricated user statistics", () => {
    expect(screen.queryByText(/hundreds of recovery groups/i)).toBeNull();
    expect(screen.queryByText(/thousands of users/i)).toBeNull();
    expect(screen.queryByText(/multiple countries/i)).toBeNull();
  });

  test("does not reference the fictional founder by name", () => {
    // The story prose previously named "James" as founder
    expect(screen.queryByText(/our founder James/i)).toBeNull();
    expect(screen.queryByText(/James envisions/i)).toBeNull();
  });

  test("founder section is present and identifies an actual person", () => {
    // Passes once we replace fictional bios with real content
    expect(screen.getByText(/The Founder/i)).toBeInTheDocument();
    expect(screen.getByText(/Marcus/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 1.3: Run the test — verify it fails**

```bash
cd web
CI=true npm test -- --testPathPattern=AboutPage --watchAll=false
```

Expected output:

```
FAIL src/pages/__tests__/AboutPage.test.js
  ● does not contain fictional team member names
    Expected element not to be present but found "James Wilson"
```

The first three tests may pass (if the test framework can find the fictional text); the fourth ("founder section is present") will fail. Both outcomes confirm the test is wired.

- [ ] **Step 1.4: Commit the failing test**

```bash
cd web
git add src/pages/__tests__/AboutPage.test.js
git commit -m "test(about): add regression tests for fictional bio content"
```

---

### Task 2: Replace fictional team members

**Files:**

- Modify: `web/src/pages/AboutPage.js` (lines 376–395)

- [ ] **Step 2.1: Replace the `teamMembers` array**

In `web/src/pages/AboutPage.js`, find this block (lines 376–395):

```javascript
const teamMembers = [
  {
    initial: "J",
    name: "James Wilson",
    role: "Founder & CEO",
    bio: "James founded Homegroups after experiencing firsthand the challenges of managing a 12-step homegroup. With 8 years in recovery and 15 years in software development, he combines these passions to serve the recovery community.",
  },
  {
    initial: "S",
    name: "Sarah Chen",
    role: "Lead Developer",
    bio: "Sarah brings 10 years of mobile app development experience to Homegroups. Her expertise in building secure communication platforms ensures our app maintains the highest standards of privacy and security.",
  },
  {
    initial: "M",
    name: "Michael Davis",
    role: "Community Manager",
    bio: "With 12 years in recovery and experience serving at the intergroup level, Michael ensures Homegroups stays true to recovery principles while meeting the real needs of recovery groups.",
  },
];
```

Replace it with:

```javascript
// IMPORTANT: Fill in your actual first name and a real bio before deploying.
const teamMembers = [
  {
    initial: "M",
    name: "Marcus",
    role: "Founder",
    bio: "A software developer with over a decade of experience and a member of the recovery community. Built Homegroups after seeing firsthand how much time homegroup treasurers and secretaries spend on paper records and disorganized handoffs.",
  },
];
```

- [ ] **Step 2.2: Update the "Our Team" section title**

Find the JSX section title (around line 509):

```javascript
<SectionTitle>Our Team</SectionTitle>
```

Replace with:

```javascript
<SectionTitle>The Founder</SectionTitle>
```

- [ ] **Step 2.3: Run tests — first two should pass**

```bash
cd web
CI=true npm test -- --testPathPattern=AboutPage --watchAll=false
```

Expected:

- `does not contain fictional team member names` → PASS
- `founder section is present` → PASS
- `does not reference the fictional founder by name` — may still FAIL (story prose still says "our founder James")

---

### Task 3: Fix story prose references to "James"

**Files:**

- Modify: `web/src/pages/AboutPage.js` (lines 455–478)

- [ ] **Step 3.1: Update story paragraph**

Find (around lines 455–477):

```javascript
              <Paragraph>
                Homegroups began with a simple problem: as a treasurer for his
                homegroup, our founder James was frustrated with the
                disorganized system of paper records, email chains, and text
                messages used to manage the group.
              </Paragraph>
              <Paragraph>
                When he became treasurer, he inherited a shoebox of receipts and
                a notebook with financial records. When his service term ended,
                he had to train the next treasurer and ensure a smooth
                transition of records—a process that was unnecessarily complex.
              </Paragraph>
```

Replace with:

```javascript
              <Paragraph>
                Homegroups began with a simple problem: as a treasurer for a
                homegroup, the founder was frustrated with the disorganized
                system of paper records, email chains, and text messages used
                to manage the group.
              </Paragraph>
              <Paragraph>
                When taking on the treasurer role, the first task was inheriting
                a shoebox of receipts and a notebook with financial records.
                When the service term ended, training the next treasurer and
                ensuring a smooth handoff of records was an unnecessarily
                complex process.
              </Paragraph>
```

---

### Task 4: Fix the timeline — remove fabricated stats

**Files:**

- Modify: `web/src/pages/AboutPage.js` (lines 397–428)

The timeline contains two fabricated claims: that within months of the 2022 launch "hundreds of recovery groups" adopted the platform, and that by 2023 the app served "thousands of users across multiple countries." These were written aspirationally but read as factual statements.

- [ ] **Step 4.1: Replace the timeline data array**

Find (lines 397–428):

```javascript
const timelineEvents = [
  {
    year: "2019",
    title: "The Idea Is Born",
    description:
      "After struggling with paper records and disorganized communication as a homegroup treasurer, James envisions a privacy-first digital solution for recovery groups.",
  },
  {
    year: "2020",
    title: "Research & Development",
    description:
      "The founding team interviews dozens of homegroup members across multiple fellowships to understand pain points and requirements.",
  },
  {
    year: "2021",
    title: "First Prototype",
    description:
      "The first version of Homegroups is built and tested with a handful of pilot groups, focusing on meeting management and treasury features.",
  },
  {
    year: "2022",
    title: "Official Launch",
    description:
      "Homegroups launches publicly with its core feature set. Within months, hundreds of recovery groups have adopted the platform.",
  },
  {
    year: "2023",
    title: "Expansion & Growth",
    description:
      "New features are added based on user feedback. Homegroups grows to serve thousands of users across multiple countries and fellowships.",
  },
];
```

Replace with:

```javascript
const timelineEvents = [
  {
    year: "2019",
    title: "The Idea Is Born",
    description:
      "After struggling with paper records and disorganized communication as a homegroup treasurer, the founder envisions a privacy-first digital solution for recovery groups.",
  },
  {
    year: "2020",
    title: "Research & Development",
    description:
      "Interviews with homegroup members across multiple fellowships surface a consistent set of pain points: treasury handoffs, meeting scheduling, and communication.",
  },
  {
    year: "2021",
    title: "First Prototype",
    description:
      "The first version of Homegroups is built and tested with pilot groups, focusing on meeting management and treasury tracking.",
  },
  {
    year: "2022",
    title: "Official Launch",
    description:
      "Homegroups launches publicly with its core feature set for group secretaries, treasurers, and members.",
  },
  {
    year: "2024",
    title: "Platform Expansion",
    description:
      "Advanced features added: governance tools, group analytics, intergroup support, and treatment center integrations.",
  },
];
```

- [ ] **Step 4.2: Run tests — all four should pass**

```bash
cd web
CI=true npm test -- --testPathPattern=AboutPage --watchAll=false
```

Expected: all 4 tests PASS.

---

### Task 5: Verify build and commit

- [ ] **Step 5.1: Verify the web build still compiles**

```bash
cd web
npm run build 2>&1 | tail -5
```

Expected: `The build folder is ready to be deployed.`

- [ ] **Step 5.2: Commit the fix**

```bash
cd web
git add src/pages/AboutPage.js src/pages/__tests__/AboutPage.test.js
git commit -m "fix(about): replace fictional founder bios with honest content (D-11)

FTC compliance fix: removes three fabricated employee profiles (James
Wilson/Sarah Chen/Michael Davis) and replaces with a single honest
founder card. Updates story prose and timeline to remove fictional
name references and fabricated user statistics.

Adds regression test to prevent re-introduction of placeholder content.
Closes D-11."
```

---

## Manual Verification (non-automated)

After deploying (`firebase deploy --only hosting` from repo root), open `/about` and confirm:

- [ ] No "James Wilson", "Sarah Chen", or "Michael Davis" visible anywhere
- [ ] "Our Team" section heading replaced with "The Founder"
- [ ] Story paragraph no longer says "our founder James"
- [ ] Timeline 2022 entry no longer claims "hundreds of groups"
- [ ] Timeline 2023 entry is gone (replaced by 2024 "Platform Expansion")
- [ ] The page still renders correctly on mobile viewport (750px)
