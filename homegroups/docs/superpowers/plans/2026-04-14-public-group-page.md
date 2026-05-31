# Public Group Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch a working public group page at `homegroups-app.com/groups/{id}` that serves SEO visitors, link-sharing members, and admin-claim conversion on the same URL, with a server-side privacy allowlist, client-rendered React + Helmet meta tags, and Universal-Link CTAs.

**Architecture:** The existing `GroupProfilePage.js` already exists but reads Firestore directly with no privacy filter. We replace its data source with a new callable Cloud Function `getPublicGroupProfile` that applies an explicit field allowlist server-side. We add `react-helmet-async` for meta tags + Schema.org JSON-LD. We add a new `publicProfileEnabled` field (default `true`) for admin opt-out. CTAs deep-link into the mobile app via Universal Links / Android App Links, with App Store / Play Store fallback.

**Tech Stack:** Firebase Cloud Functions (Node 22, TypeScript), React 18, `react-helmet-async`, `styled-components`, `react-router-dom`. Tests: Jest (functions), Jest + React Testing Library (web, if present — otherwise manual verification).

**Spec:** `docs/superpowers/specs/2026-04-14-public-group-page-design.md`

---

## Task 1: Callable `getPublicGroupProfile` with allowlist + tests

**Why first:** Every downstream change depends on this callable returning the right shape. Shipping it alone is safe (no callers yet).

**Files:**

- Create: `functions/src/callable/getPublicGroupProfile.ts`
- Create: `functions/src/__tests__/getPublicGroupProfile.test.ts`
- Modify: `functions/src/index.ts` (add one export line)

### Step 1.1: Write the failing test

- [ ] Create `functions/src/__tests__/getPublicGroupProfile.test.ts`:

```typescript
/**
 * Tests for getPublicGroupProfile callable.
 * Verifies the privacy allowlist: only permitted fields are returned.
 */

export {}; // Ensure isolated module

// ---- Mocks ----
const mockHttpsError = jest.fn().mockImplementation(function (
  this: Error & { code: string },
  code: string,
  message: string,
) {
  this.code = code;
  this.message = message;
  Object.setPrototypeOf(this, Error.prototype);
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
    HttpsError: mockHttpsError,
  },
}));

const mockGet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));
jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
}));

// ---- Imports ----
import { getPublicGroupProfile } from "../callable/getPublicGroupProfile";

// ---- Helpers ----
function makeRequest(data: any) {
  return { data, auth: undefined } as any;
}

function makeGroupSnap(data: any, exists = true) {
  return { exists, data: () => data, id: data?.id ?? "group-1" };
}

const FULL_GROUP_DOC = {
  id: "group-1",
  name: "Downtown Monday Beginners",
  description: "A beginner-friendly AA group.",
  type: "AA",
  placeName: "First Methodist Church",
  location: "123 Main St, Phoenix, AZ 85001",
  address: "123 Main St",
  city: "Phoenix",
  state: "AZ",
  zip: "85001",
  lat: 33.45,
  lng: -112.07,
  foundedDate: "2010-05-01",
  memberCount: 42,
  isClaimed: true,
  admins: ["user-admin-1"],
  treasurers: ["user-admin-1"],
  stripeCustomerId: "cus_xxx",
  stripeSubscriptionId: "sub_xxx",
  subscriptionStatus: "active",
  meetings: [
    {
      day: "1",
      time: "19:00",
      format: "Open Discussion",
      locationName: "Fellowship Hall",
      online: false,
      onlineLink: "https://zoom.us/j/secret",
      onlineNotes: "Password: recovery",
    },
  ],
  publicProfileEnabled: true,
};

// ---- Tests ----
describe("getPublicGroupProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws invalid-argument when groupId missing", async () => {
    await expect(getPublicGroupProfile(makeRequest({}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found when group does not exist", async () => {
    mockGet.mockResolvedValueOnce(makeGroupSnap(null, false));
    await expect(
      getPublicGroupProfile(makeRequest({ groupId: "missing" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws not-found when publicProfileEnabled is false", async () => {
    mockGet.mockResolvedValueOnce(
      makeGroupSnap({ ...FULL_GROUP_DOC, publicProfileEnabled: false }),
    );
    await expect(
      getPublicGroupProfile(makeRequest({ groupId: "group-1" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("defaults publicProfileEnabled to true when absent", async () => {
    const { publicProfileEnabled, ...rest } = FULL_GROUP_DOC;
    mockGet.mockResolvedValueOnce(makeGroupSnap(rest));
    const result = await getPublicGroupProfile(
      makeRequest({ groupId: "group-1" }),
    );
    expect(result.name).toBe("Downtown Monday Beginners");
  });

  it("returns ONLY allowlisted fields for a claimed group", async () => {
    mockGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const result = await getPublicGroupProfile(
      makeRequest({ groupId: "group-1" }),
    );

    // Allowlist regression guard — any new field appearing here fails the test.
    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "name",
        "type",
        "description",
        "placeName",
        "city",
        "state",
        "isClaimed",
        "meetings",
      ].sort(),
    );

    expect(result.name).toBe("Downtown Monday Beginners");
    expect(result.type).toBe("AA");
    expect(result.description).toBe("A beginner-friendly AA group.");
    expect(result.placeName).toBe("First Methodist Church");
    expect(result.city).toBe("Phoenix");
    expect(result.state).toBe("AZ");
    expect(result.isClaimed).toBe(true);
  });

  it("omits description when group is unclaimed", async () => {
    mockGet.mockResolvedValueOnce(
      makeGroupSnap({ ...FULL_GROUP_DOC, isClaimed: false }),
    );
    const result = await getPublicGroupProfile(
      makeRequest({ groupId: "group-1" }),
    );
    expect(result.description).toBeUndefined();
    expect(result.isClaimed).toBe(false);
  });

  it("filters meeting fields — no onlineLink or onlineNotes leaked", async () => {
    mockGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const result = await getPublicGroupProfile(
      makeRequest({ groupId: "group-1" }),
    );
    expect(result.meetings).toHaveLength(1);
    const m = result.meetings[0];
    expect(Object.keys(m).sort()).toEqual(
      ["day", "time", "format", "locationName", "isOnline"].sort(),
    );
    expect((m as any).onlineLink).toBeUndefined();
    expect((m as any).onlineNotes).toBeUndefined();
  });

  it("does not leak address, coordinates, member count, treasury, or Stripe fields", async () => {
    mockGet.mockResolvedValueOnce(makeGroupSnap(FULL_GROUP_DOC));
    const result = await getPublicGroupProfile(
      makeRequest({ groupId: "group-1" }),
    );
    const leaked = [
      "address",
      "zip",
      "lat",
      "lng",
      "memberCount",
      "foundedDate",
      "admins",
      "treasurers",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "subscriptionStatus",
      "location",
    ];
    for (const field of leaked) {
      expect((result as any)[field]).toBeUndefined();
    }
  });
});
```

### Step 1.2: Run the test to verify it fails

- [ ] Run:

```bash
cd functions && npm test -- --testPathPattern=getPublicGroupProfile
```

Expected: FAIL with `Cannot find module '../callable/getPublicGroupProfile'`.

### Step 1.3: Implement the callable

- [ ] Create `functions/src/callable/getPublicGroupProfile.ts`:

```typescript
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../utils/firebase";

interface GetPublicGroupProfileData {
  groupId: string;
}

export interface PublicMeeting {
  day?: string;
  time?: string;
  format?: string;
  locationName?: string;
  isOnline?: boolean;
}

export interface PublicGroupProfile {
  id: string;
  name: string;
  type: string;
  description?: string; // only present when isClaimed
  placeName?: string;
  city?: string;
  state?: string;
  isClaimed: boolean;
  meetings: PublicMeeting[];
}

function pickMeeting(m: any): PublicMeeting {
  return {
    day: m?.day,
    time: m?.time,
    format: m?.format,
    locationName: m?.locationName,
    isOnline: m?.online === true,
  };
}

export const getPublicGroupProfile = functions.https.onCall(
  async (
    request: CallableRequest<GetPublicGroupProfileData>,
  ): Promise<PublicGroupProfile> => {
    const { groupId } = request.data || ({} as GetPublicGroupProfileData);

    if (!groupId) {
      throw new HttpsError("invalid-argument", "groupId is required.");
    }

    const snap = await db.collection("groups").doc(groupId).get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const data = snap.data() || {};

    // Opt-out respected; default is true when field is absent.
    const publicEnabled = data.publicProfileEnabled ?? true;
    if (publicEnabled === false) {
      throw new HttpsError("not-found", "Group not found.");
    }

    const isClaimed = data.isClaimed === true;
    const meetings: any[] = Array.isArray(data.meetings) ? data.meetings : [];

    const profile: PublicGroupProfile = {
      id: snap.id,
      name: data.name ?? "",
      type: data.type ?? "",
      placeName: data.placeName,
      city: data.city,
      state: data.state,
      isClaimed,
      meetings: meetings.map(pickMeeting),
    };

    if (isClaimed && data.description) {
      profile.description = data.description;
    }

    return profile;
  },
);
```

### Step 1.4: Run tests and verify they pass

- [ ] Run:

```bash
cd functions && npm test -- --testPathPattern=getPublicGroupProfile
```

Expected: all 8 tests PASS.

### Step 1.5: Export from `index.ts`

- [ ] Add one line to `functions/src/index.ts`. Find the block of `export { ... } from "./callable/...";` lines and add alphabetically (near `getGroupSubscriptionInfo`):

```typescript
export { getPublicGroupProfile } from "./callable/getPublicGroupProfile";
```

### Step 1.6: Type-check the whole functions project

- [ ] Run:

```bash
cd functions && npm run build
```

Expected: clean TypeScript compile, no errors.

### Step 1.7: Commit

- [ ] Run:

```bash
git add functions/src/callable/getPublicGroupProfile.ts \
  functions/src/__tests__/getPublicGroupProfile.test.ts \
  functions/src/index.ts
git commit -m "feat(functions): getPublicGroupProfile callable with privacy allowlist"
```

---

## Task 2: Add `publicProfileEnabled` field to Group schema

**Why:** The callable already reads this field; now we give admins the UI to toggle it. Default behavior is unchanged (groups are public unless admin opts out).

**Files:**

- Modify: `functions/src/entities/Group.ts` (add one optional field)
- Modify: `mobile/src/types/schema.ts` (add one optional field)
- Modify: `mobile/src/screens/homegroup/GroupSettingsScreen.tsx` (or equivalent — find the settings screen first)

### Step 2.1: Locate the mobile group settings screen

- [ ] Run:

```bash
ls mobile/src/screens/homegroup/ | grep -i setting
```

Expected: one or more files. Open the one that renders admin-only privacy/visibility toggles. If there is no existing toggle pattern, find any boolean toggle (e.g. `allowMemberChat`) and copy its implementation pattern.

Record the exact file path found; the steps below reference it as `<GroupSettingsScreen>`.

### Step 2.2: Add field to `functions/src/entities/Group.ts`

- [ ] Edit `functions/src/entities/Group.ts`. In the `HomeGroup` interface, after `stripeProductIdGroup?: string;`, add:

```typescript
  publicProfileEnabled?: boolean; // default: true. Admin can set false to hide from public web page.
```

### Step 2.3: Add field to `mobile/src/types/schema.ts`

- [ ] In the mobile `Group` (or `HomeGroup`) type in `mobile/src/types/schema.ts`, add the same optional field:

```typescript
  publicProfileEnabled?: boolean;
```

### Step 2.4: Write failing test for the settings screen toggle

- [ ] Find the existing Jest test for the settings screen (if one exists). If not, add a minimal unit test that:
  - Renders the screen with `group.publicProfileEnabled === true` and expects a toggle labeled "Public web page" in the "on" state.
  - Calls the update action with `publicProfileEnabled: false` when toggled off.

If no test harness exists for the settings screen, skip the test and instead add a manual verification note to Task 9. Prefer testing — only skip if the infrastructure truly is absent. Record the decision in the commit message.

### Step 2.5: Add the toggle UI to `<GroupSettingsScreen>`

- [ ] Add a new row in the admin-only privacy/visibility section. Use the same Switch/toggle component used elsewhere in the file. Label: "Public web page". Subtitle: "Show a public page for this group at homegroups-app.com so anyone can find meeting times and share the link". Bind to `group.publicProfileEnabled ?? true`. On change, dispatch the existing group-update thunk with `{ publicProfileEnabled: newValue }`.

Concrete snippet (adapt to the file's existing Switch pattern):

```tsx
<View style={styles.row}>
  <View style={styles.rowText}>
    <Text style={styles.rowTitle}>Public web page</Text>
    <Text style={styles.rowSubtitle}>
      Show a public page at homegroups-app.com with meeting times so anyone can
      find and share this group.
    </Text>
  </View>
  <Switch
    value={group.publicProfileEnabled ?? true}
    onValueChange={(v) =>
      dispatch(
        updateGroup({
          groupId: group.id,
          changes: { publicProfileEnabled: v },
        }),
      )
    }
    testID="group-public-profile-toggle"
  />
</View>
```

### Step 2.6: Run mobile lint and tests

- [ ] Run:

```bash
cd mobile && npm run lint && npm test -- --testPathPattern=GroupSettings
```

Expected: no lint errors; tests (if added) pass.

### Step 2.7: Type-check functions project

- [ ] Run:

```bash
cd functions && npm run build
```

Expected: clean compile.

### Step 2.8: Commit

- [ ] Run:

```bash
git add functions/src/entities/Group.ts mobile/src/types/schema.ts <GroupSettingsScreen path>
git commit -m "feat(groups): add publicProfileEnabled toggle to group settings"
```

---

## Task 3: Add `react-helmet-async` to the web project

**Why:** Every meta-tag change below depends on `<HelmetProvider>` wrapping the app.

**Files:**

- Modify: `web/package.json`
- Modify: `web/src/index.js`

### Step 3.1: Install the dependency

- [ ] Run:

```bash
cd web && npm install react-helmet-async
```

Expected: adds `"react-helmet-async": "^2.x.x"` to `dependencies`. No lockfile conflict.

### Step 3.2: Wrap the app in `HelmetProvider`

- [ ] Edit `web/src/index.js`. Import `HelmetProvider` and wrap the existing `<App />`:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
);

reportWebVitals();
```

(Preserve whatever exists around the `root.render(...)` call; only add the import and the wrapper.)

### Step 3.3: Verify the web app still boots

- [ ] Run:

```bash
cd web && npm start
```

Expected: dev server starts on port 3000 and the home page renders without console errors. Stop the server (`Ctrl+C`) once verified.

### Step 3.4: Commit

- [ ] Run:

```bash
git add web/package.json web/package-lock.json web/src/index.js
git commit -m "chore(web): add react-helmet-async + HelmetProvider"
```

---

## Task 4: `GroupPageHead` component — meta tags + JSON-LD

**Files:**

- Create: `web/src/components/GroupPageHead.js`

### Step 4.1: Implement the component

- [ ] Create `web/src/components/GroupPageHead.js`:

```jsx
import React from "react";
import { Helmet } from "react-helmet-async";

const SITE_ORIGIN = "https://homegroups-app.com";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function buildTitle(group) {
  const locale = [group.city, group.state].filter(Boolean).join(", ");
  const suffix = locale ? ` in ${locale}` : "";
  return `${group.name} — ${group.type} Group${suffix} | Homegroups`;
}

function buildDescription(group) {
  const locale = [group.city, group.state].filter(Boolean).join(", ");
  const firstMeeting = group.meetings && group.meetings[0];
  const meetingStr = firstMeeting
    ? `${DAY_NAMES[parseInt(firstMeeting.day, 10)] ?? ""} ${firstMeeting.time ?? ""}`.trim()
    : "";
  const parts = [
    `${group.type} ${firstMeeting?.format ?? "recovery"} meeting`,
    meetingStr ? `${meetingStr}` : null,
    locale ? `in ${locale}` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. View the schedule and connect via the Homegroups app.`;
}

function buildEventLdJson(group) {
  if (!group.meetings || group.meetings.length === 0) return null;
  return group.meetings.map((m, i) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${group.name} — ${DAY_NAMES[parseInt(m.day, 10)] ?? ""}`,
    startDate: undefined, // recurring time-of-day, no fixed date
    eventAttendanceMode: m.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: m.isOnline
      ? { "@type": "VirtualLocation", url: `${SITE_ORIGIN}/groups/${group.id}` }
      : {
          "@type": "Place",
          name: m.locationName || group.placeName || "In-person meeting",
          address: [group.city, group.state].filter(Boolean).join(", "),
        },
    organizer: {
      "@type": "Organization",
      name: group.name,
      url: `${SITE_ORIGIN}/groups/${group.id}`,
    },
    description: `${group.type} meeting, ${m.format || ""}`.trim(),
  }));
}

export default function GroupPageHead({ group }) {
  if (!group) return null;
  const url = `${SITE_ORIGIN}/groups/${group.id}`;
  const title = buildTitle(group);
  const description = buildDescription(group);
  const isClaimed = group.isClaimed === true;
  const events = buildEventLdJson(group);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={group.name} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={DEFAULT_OG_IMAGE} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={group.name} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />

      {/* Robots: noindex unclaimed groups during launch phase */}
      {!isClaimed && <meta name="robots" content="noindex, follow" />}

      {/* Schema.org structured data */}
      {events &&
        events.map((evt, i) => (
          <script key={i} type="application/ld+json">
            {JSON.stringify(evt)}
          </script>
        ))}
    </Helmet>
  );
}
```

### Step 4.2: Add a default OG image

- [ ] Check whether `web/public/og-default.png` exists:

```bash
ls web/public/og-default.png 2>/dev/null || echo "MISSING"
```

If `MISSING`, use the existing app logo as a placeholder (copy any `.png` in `web/public/` named like `logo*.png` or `homegroups*.png` to `og-default.png`). If no suitable image exists, flag this to the user before proceeding — do not ship without an OG image, link previews will look broken.

### Step 4.3: Commit

- [ ] Run:

```bash
git add web/src/components/GroupPageHead.js web/public/og-default.png
git commit -m "feat(web): GroupPageHead with meta tags + Schema.org JSON-LD"
```

---

## Task 5: Deep-link helper module

**Files:**

- Create: `web/src/lib/deepLinks.js`

### Step 5.1: Implement the helper

- [ ] Create `web/src/lib/deepLinks.js`:

```javascript
/**
 * Deep-link helpers for the public group page CTAs.
 *
 * Universal Links: on iOS/Android with the app installed, these URLs open
 * the app directly. Without the app, they stay in the browser and we
 * redirect to the appropriate store.
 */

const APP_STORE_URL = "https://apps.apple.com/app/homegroups/id0000000000"; // TODO: real ID
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.homegroups";
const WEB_ORIGIN = "https://homegroups-app.com";

export function buildGroupDeepLink(groupId) {
  return `${WEB_ORIGIN}/groups/${encodeURIComponent(groupId)}`;
}

export function buildClaimDeepLink(groupId) {
  return `${WEB_ORIGIN}/groups/${encodeURIComponent(groupId)}/claim`;
}

export function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function getStoreUrl() {
  const platform = detectPlatform();
  if (platform === "ios") return APP_STORE_URL;
  if (platform === "android") return PLAY_STORE_URL;
  // Desktop: send to iOS (default) — user will figure it out
  return APP_STORE_URL;
}
```

### Step 5.2: Confirm the App Store URL

- [ ] Search the repo for the real App Store ID:

```bash
grep -rn "apps.apple.com\|itunes.apple.com" mobile/ web/ docs/ 2>/dev/null | head -5
```

If a real App Store ID is found, replace `id0000000000` in `deepLinks.js` with the real value. If not found, leave the placeholder and add a note in the commit: "App Store URL needs real ID once app is published."

### Step 5.3: Commit

- [ ] Run:

```bash
git add web/src/lib/deepLinks.js
git commit -m "feat(web): deep-link helpers for group page CTAs"
```

---

## Task 6: `GroupCallToAction` component — claimed + unclaimed variants

**Files:**

- Create: `web/src/components/GroupCallToAction.js`

### Step 6.1: Implement the component

- [ ] Create `web/src/components/GroupCallToAction.js`:

```jsx
import React from "react";
import styled from "styled-components";
import {
  buildGroupDeepLink,
  buildClaimDeepLink,
  getStoreUrl,
} from "../lib/deepLinks";

const CtaSection = styled.div`
  background: var(--background-alt);
  padding: 2rem;
  border-radius: 8px;
  margin-top: 2rem;
  text-align: center;
`;

const CtaHeading = styled.h3`
  margin: 0 0 0.75rem;
  color: var(--text-primary);
`;

const CtaSubtext = styled.p`
  margin: 0 0 1.5rem;
  color: var(--text-secondary);
`;

const PrimaryButton = styled.a`
  display: inline-block;
  padding: 0.875rem 1.75rem;
  background: var(--primary-color);
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: background-color 0.2s;

  &:hover {
    background: var(--primary-dark);
  }
`;

const SecondaryButton = styled.a`
  display: inline-block;
  margin-top: 0.75rem;
  padding: 0.5rem 1rem;
  color: var(--primary-color);
  text-decoration: underline;
  font-size: 0.95rem;
`;

const UnclaimedBanner = styled.div`
  background: #fff8e1;
  border: 1px solid #ffe082;
  color: #7a5900;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin: 1.5rem 0;
`;

export default function GroupCallToAction({ group }) {
  if (!group) return null;

  if (group.isClaimed) {
    return (
      <CtaSection>
        <CtaHeading>Connect with this group</CtaHeading>
        <CtaSubtext>
          Open {group.name} in the Homegroups app to see members, announcements,
          and the full meeting schedule.
        </CtaSubtext>
        <PrimaryButton href={buildGroupDeepLink(group.id)}>
          Open in Homegroups app
        </PrimaryButton>
        <br />
        <SecondaryButton href={getStoreUrl()}>
          Don't have the app? Download →
        </SecondaryButton>
      </CtaSection>
    );
  }

  // Unclaimed
  return (
    <>
      <UnclaimedBanner>
        <strong>This group hasn't been claimed yet.</strong> Meeting info may be
        out of date.
      </UnclaimedBanner>
      <CtaSection>
        <CtaHeading>Are you a trusted servant of this group?</CtaHeading>
        <CtaSubtext>
          Claim this group to keep meeting info accurate, communicate with
          members, and manage the group treasury.
        </CtaSubtext>
        <PrimaryButton href={buildClaimDeepLink(group.id)}>
          Claim this group →
        </PrimaryButton>
        <br />
        <SecondaryButton href={getStoreUrl()}>
          Download the Homegroups app
        </SecondaryButton>
      </CtaSection>
    </>
  );
}
```

### Step 6.2: Commit

- [ ] Run:

```bash
git add web/src/components/GroupCallToAction.js
git commit -m "feat(web): GroupCallToAction with claimed and unclaimed variants"
```

---

## Task 7: Rewire `GroupProfilePage.js` to use the callable + new components

**Why:** Replace the raw `getDoc` with the privacy-filtered callable, drop `memberCount`/`foundedDate` from the UI (they are no longer returned), uncomment meetings, and plug in `GroupPageHead` + `GroupCallToAction`.

**Files:**

- Modify: `web/src/pages/GroupProfilePage.js`
- Modify: `web/src/lib/firebase.js` (verify it exports `functions` — if not, add it)

### Step 7.1: Verify Firebase `functions` is exported from `web/src/lib/firebase.js`

- [ ] Run:

```bash
cat web/src/lib/firebase.js
```

Look for an export of `functions` from `getFunctions(app)`. If missing, add:

```javascript
import { getFunctions } from "firebase/functions";
// ... existing code ...
export const functions = getFunctions(app);
```

### Step 7.2: Rewrite `GroupProfilePage.js`

- [ ] Replace the entire contents of `web/src/pages/GroupProfilePage.js` with:

```jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import GroupPageHead from "../components/GroupPageHead";
import GroupCallToAction from "../components/GroupCallToAction";
import NewsletterSignup from "../components/NewsletterSignup";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 6rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: ${(props) =>
    props.verified ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.2)"};
  color: white;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const PageTitle = styled.h1`
  font-size: 3rem;
  margin: 0 0 0.75rem;

  @media (max-width: 768px) {
    font-size: 2.25rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.125rem;
  opacity: 0.9;
  margin: 0;
`;

const ContentSection = styled.section`
  padding: 4rem 1rem;
  background-color: var(--background);
`;

const ContentContainer = styled.div`
  max-width: 960px;
  margin: 0 auto;
`;

const ErrorMessage = styled.div`
  color: var(--error-color);
  text-align: center;
  padding: 2rem;
  background: var(--background-alt);
  border-radius: 8px;
  margin: 2rem 0;
`;

const MeetingList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
`;

const MeetingItem = styled.li`
  background: var(--background-alt);
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

function formatMeeting(m) {
  const dayIdx = parseInt(m.day, 10);
  const day = Number.isFinite(dayIdx) ? DAY_NAMES[dayIdx] : "";
  const time = m.time || "";
  return [day, time].filter(Boolean).join(" at ");
}

const GroupProfile = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, "getPublicGroupProfile");
        const result = await fn({ groupId: id });
        if (cancelled) return;
        setGroup(result.data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err && err.code === "functions/not-found") {
          setError("Group not found");
        } else {
          console.error("Error fetching group:", err);
          setError("Unable to load group information. Please try again later.");
        }
        setGroup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <PageContainer>
        <ContentSection>
          <ContentContainer>
            <h2>Loading…</h2>
          </ContentContainer>
        </ContentSection>
      </PageContainer>
    );
  }

  if (error || !group) {
    return (
      <PageContainer>
        <ContentSection>
          <ContentContainer>
            <ErrorMessage>
              <h2>Group Not Found</h2>
              <p>{error || "The requested group could not be found."}</p>
            </ErrorMessage>
          </ContentContainer>
        </ContentSection>
      </PageContainer>
    );
  }

  const locale = [group.city, group.state].filter(Boolean).join(", ");

  return (
    <PageContainer>
      <GroupPageHead group={group} />

      <HeroSection>
        <HeroContent>
          <Badge verified={group.isClaimed}>
            {group.isClaimed ? "Verified ✓" : "Unverified"}
          </Badge>
          <PageTitle>{group.name}</PageTitle>
          <PageSubtitle>
            {[group.type, locale].filter(Boolean).join(" · ")}
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <ContentSection>
        <ContentContainer
          ref={ref}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          {group.isClaimed && group.description && (
            <>
              <h2>About this group</h2>
              <p>{group.description}</p>
            </>
          )}

          <h2>Meetings</h2>
          {group.meetings && group.meetings.length > 0 ? (
            <MeetingList>
              {group.meetings.map((m, i) => (
                <MeetingItem key={i}>
                  <strong>{formatMeeting(m)}</strong>
                  <span>
                    {m.format}
                    {m.isOnline
                      ? " · Online"
                      : m.locationName
                        ? ` · ${m.locationName}`
                        : ""}
                  </span>
                </MeetingItem>
              ))}
            </MeetingList>
          ) : (
            <p>No meeting schedule is available for this group yet.</p>
          )}

          <GroupCallToAction group={group} />
        </ContentContainer>
      </ContentSection>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default GroupProfile;
```

### Step 7.3: Build the web app to catch compile errors

- [ ] Run:

```bash
cd web && npm run build
```

Expected: `Compiled successfully` (or similar). ESLint warnings are OK; errors are not.

### Step 7.4: Smoke-test locally against Firebase emulators

- [ ] Start the functions emulator from the repo root:

```bash
firebase emulators:start --only functions,firestore
```

- [ ] In another terminal, start the web dev server:

```bash
cd web && npm start
```

- [ ] Visit `http://localhost:3000/groups/<some-test-id>` and verify:
  - Page loads (not blank).
  - Hero shows the group name, type, city/state.
  - "Unverified" or "Verified ✓" badge appears correctly.
  - Meetings section lists meetings or shows the empty-state.
  - CTA section shows the right variant (claim vs open-in-app).

If you do not have a test group in the emulator, seed one by writing a small script against the emulator Firestore, or use an existing non-production group ID from a dev Firebase project with `NODE_ENV=development`.

### Step 7.5: Commit

- [ ] Run:

```bash
git add web/src/pages/GroupProfilePage.js web/src/lib/firebase.js
git commit -m "feat(web): rewire group profile page to privacy-filtered callable"
```

---

## Task 8: Verify Universal Links / Android App Links infrastructure

**Why:** CTAs rely on AASA (iOS) and `assetlinks.json` (Android) to open the installed app instead of the browser.

**Files to verify / possibly create:**

- `web/public/.well-known/apple-app-site-association`
- `web/public/.well-known/assetlinks.json`

### Step 8.1: Check whether the AASA file exists

- [ ] Run:

```bash
ls web/public/.well-known/ 2>/dev/null || echo "MISSING .well-known"
```

Expected: directory exists with `apple-app-site-association` and `assetlinks.json`.

If `MISSING`, create the directory and proceed to 8.2 and 8.3. If the files already exist, skim them and confirm the bundle IDs match the mobile app.

### Step 8.2: (If missing) Create AASA

- [ ] Find the iOS bundle ID:

```bash
grep -rn "PRODUCT_BUNDLE_IDENTIFIER" mobile/ios/ | head -5
```

Record the value (e.g. `com.homegroups`). You also need the **Apple Team ID** (10-character alphanumeric). If the team ID is not in the repo, ask the user for it before proceeding — do not invent a value.

- [ ] Create `web/public/.well-known/apple-app-site-association` (NO file extension, content-type is set by `firebase.json`):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.homegroups",
        "paths": ["/groups/*"]
      }
    ]
  }
}
```

Replace `TEAMID` with the real team ID and `com.homegroups` with the real bundle ID.

### Step 8.3: (If missing) Create `assetlinks.json`

- [ ] Find the Android package name:

```bash
grep -n "applicationId\|package=" mobile/android/app/build.gradle mobile/android/app/src/main/AndroidManifest.xml 2>/dev/null | head -5
```

You also need the **SHA-256 fingerprint** of the app signing certificate. Run:

```bash
cd mobile/android && ./gradlew signingReport 2>/dev/null | grep -A1 "Variant: release" | grep SHA-256
```

If this fails or no release signing config is set up yet, flag to the user before continuing — `assetlinks.json` is useless without the real fingerprint.

- [ ] Create `web/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.homegroups",
      "sha256_cert_fingerprints": ["AA:BB:CC:...replace with real SHA-256..."]
    }
  }
]
```

### Step 8.4: Confirm `firebase.json` serves both files with correct `Content-Type`

- [ ] Read `firebase.json`:

```bash
grep -A8 "well-known" firebase.json
```

Expected: there is a headers rule setting `Content-Type: application/json` for `apple-app-site-association`. If `assetlinks.json` does not have an explicit header rule, it does not need one (its extension implies JSON).

### Step 8.5: Deploy hosting to a staging channel and verify

- [ ] Deploy to a preview channel:

```bash
firebase hosting:channel:deploy preview-group-page --expires 7d
```

- [ ] Visit the printed preview URL + `/.well-known/apple-app-site-association` and confirm the JSON loads as `application/json`.

- [ ] Visit the preview URL + `/.well-known/assetlinks.json` and confirm same.

### Step 8.6: Commit (only if files were created)

- [ ] Run:

```bash
git add web/public/.well-known/
git commit -m "feat(web): add AASA and assetlinks.json for Universal Links"
```

---

## Task 9: Manual end-to-end verification

**Why:** Link previews, Universal Links, and SEO render differently across platforms and cannot be fully automated.

**Files:** None. This is a checklist.

### Step 9.1: Link-preview check

- [ ] Deploy the preview channel from Task 8.5 (or reuse it).

- [ ] Send the URL `https://<preview-host>/groups/<a-claimed-group-id>` to each of:
  - iMessage (Mac or iPhone)
  - Slack
  - Twitter/X (use the Card Validator at cards-dev.twitter.com/validator)

- [ ] Verify each preview shows the group name, description snippet, and a visible image (the OG default). If any preview is broken, inspect the source: `curl -s <url> | grep -E 'og:|twitter:|title'` and confirm the expected tags are present.

### Step 9.2: iOS Universal Link check

- [ ] Install the latest mobile app build on an iOS device or simulator with the staging Firebase project configured.

- [ ] Send the preview URL via iMessage to yourself. Tap the link: the Homegroups app should open directly to `GroupOverviewScreen` for that group.

- [ ] Uninstall the app. Tap the link again: Safari should open the web page. Tap "Open in Homegroups app" → App Store.

### Step 9.3: Android App Links check

- [ ] Repeat Step 9.2 on an Android device or emulator with the app installed.

### Step 9.4: SEO sanity check

- [ ] Inspect a claimed group page's HTML after JS execution:

```bash
curl -s https://<preview-host>/groups/<id> > /tmp/page.html
grep -E "og:|twitter:|application/ld\+json|<title>" /tmp/page.html
```

The initial HTML will NOT show the Helmet-injected tags (that is expected with client-render). To verify Google sees them, use:

- Google's "Rich Results Test" → paste the URL → verify Schema.org events appear.
- `view-source:` in Chrome then render the page and re-inspect `document.head.innerHTML` in DevTools. The tags should be present after render.

### Step 9.5: Unclaimed group robots check

- [ ] Open DevTools on an unclaimed group page. In the console:

```javascript
document.querySelector('meta[name="robots"]').getAttribute("content");
```

Expected: `"noindex, follow"`.

- [ ] Open DevTools on a claimed group page. Same query.

Expected: `null` (no robots meta tag).

### Step 9.6: Admin opt-out check

- [ ] In the mobile app, open an admin-owned group's settings. Toggle "Public web page" OFF.

- [ ] Wait a few seconds for Firestore propagation, then reload the public page for that group.

- [ ] Expected: the page shows "Group Not Found" error (the callable returns 404 when `publicProfileEnabled === false`).

- [ ] Toggle the setting back ON. Reload. Expected: page loads normally.

### Step 9.7: Ship-it commit

- [ ] If all checks pass, tag the staging release:

```bash
git tag -a public-group-page-v1 -m "Public group page Phase 1 complete"
```

- [ ] Deploy to production hosting:

```bash
firebase deploy --only hosting,functions:getPublicGroupProfile
```

---

## Post-Launch Follow-Ups (not in this plan)

- Add `firebase-functions-rate-limiter` to `getPublicGroupProfile` once real traffic arrives.
- Flip `noindex` on unclaimed pages to `index` once ~100–200 groups are claimed.
- Migrate to SSR (Phase 2) when organic traffic justifies the complexity.
- Add analytics (GA4 or similar) on `/groups/:id` views.
- Build a sitemap generator that lists claimed groups only.
