# Public Group Page — Design Spec

**Date:** 2026-04-14
**Status:** Approved, ready for implementation plan
**Related:** `docs/ROADMAP.md` ("Immediate Next Steps" #4), `docs/analysis-product-strategy-2026-02-23-launch.md`

## Goal

Turn `homegroups-app.com/groups/{groupId}` into a working public page that serves three audiences simultaneously: SEO visitors, members sharing the link with newcomers, and trusted servants discovering their unclaimed group.

## Context

An existing `GroupProfilePage` component already lives at `/groups/:id` in `web/src/pages/GroupProfilePage.js`. It reads the group document via the Firestore client SDK and renders name, type, description, location, member count, founded date, and claimed status. The meeting schedule section is commented out. There are no meta tags, no Schema.org markup, no deep links, and no explicit privacy filter on the fields displayed.

Firestore contains 100K+ pre-seeded groups scraped from AA/NA meeting directories. At launch, nearly all of them will be unclaimed. The unclaimed-state rendering is therefore not an edge case but the dominant path.

## Design Decisions

### Privacy — what is public

Only meeting-directory-style information and admin-authored content:

- Group `name`, `type` (AA/NA/Al-Anon/etc.), `format` (open/closed)
- `placeName`, `city`, `state` — no street address, no coordinates
- `description` — only when `isClaimed === true` (admin has opted in by claiming)
- `isClaimed` — drives the Verified/Unverified badge
- `meetings[]`, filtered to `{ day, time, format, locationName, isOnline }` — no `meetingLink`, no chair assignments

Never public: `memberCount`, `foundedDate`, admin UIDs, Stripe fields, treasury, per-member data, street addresses, coordinates, meeting join links, chair assignments.

New optional field `publicProfileEnabled: boolean` on the group document. Defaults to `true` (via `?? true` in the callable). Admin can disable in group settings to remove their page from the public web entirely.

### Rendering — client-side React + React Helmet

Phase 1 ships with client-rendered React plus meta tags injected by `react-helmet-async`. Google and social crawlers execute JavaScript, so link previews and eventual indexing work. SSR via Cloud Functions is deferred to Phase 2, to be revisited when organic traffic justifies the complexity.

### Unclaimed groups — render with claim CTA, noindex for now

Unclaimed groups render the same template with a visible "Unverified" badge, an advisory that meeting info may be out of date, and a prominent "Claim this group" call to action. For the first 60 days post-launch, unclaimed pages carry `<meta name="robots" content="noindex, follow">` to avoid publishing thousands of thin programmatically-generated pages before enough claimed groups exist to establish site authority. Flip to `index` once ~100–200 groups are claimed.

### Data access — dedicated callable Function

Replace the client-side Firestore read with a callable Cloud Function `getPublicGroupProfile(groupId)` that applies an explicit field allowlist server-side. This gives a single reviewable source of truth for what is public, prevents new fields from leaking by default, and lets Phase 2 SSR reuse the same endpoint. Firestore security rules do not need to permit public reads of groups.

## Page Layouts

### Claimed state

- Header: verified badge, group name, type + format + city
- About: admin-written description
- Meetings: list of meeting times with format and location name
- Primary CTA: "Open in Homegroups app" (Universal Link)
- Secondary CTA: "Don't have the app? Download"

### Unclaimed state

- Header: unverified badge, group name, type + city
- Meetings: list of meeting times
- Advisory: "This group hasn't been claimed yet. Meeting info may be out of date."
- Primary CTA: "Are you a trusted servant of this group? Claim this group"
- Secondary CTA: "Download the Homegroups app"

## Meta Tags and Structured Data

React Helmet injects, per page:

- `<title>`: `"{name} — {type} Group in {city}, {state} | Homegroups"`
- `<meta name="description">`: one-sentence summary of type, format, times, city
- OpenGraph tags: `og:title`, `og:description`, `og:url`, `og:type=website`, `og:image` (shared default)
- Twitter card: `summary_large_image`
- `<link rel="canonical">` to the canonical URL
- `<meta name="robots" content="noindex, follow">` for unclaimed groups (temporary, flip to `index` at ~100–200 claimed groups)
- JSON-LD `<script>` with Schema.org `Organization` plus `Event` entries per meeting time

## CTA Routing

Three deep-link targets, all via Universal Links / Android App Links where possible with App Store / Play Store fallback:

| CTA                          | Web URL                                | App target            | Fallback                                                  |
| ---------------------------- | -------------------------------------- | --------------------- | --------------------------------------------------------- |
| Open in app (claimed)        | `homegroups-app.com/groups/{id}`       | `GroupOverviewScreen` | App Store                                                 |
| Claim this group (unclaimed) | `homegroups-app.com/groups/{id}/claim` | `ClaimGroupScreen`    | App Store (user finds the group and claims after install) |
| Download the app             | n/a                                    | n/a                   | Platform-detected redirect to App Store or Play Store     |

`firebase.json` already configures the `Content-Type` header for `/.well-known/apple-app-site-association`. Whether the AASA file itself is present at `web/public/.well-known/` must be verified during implementation; if missing, adding it is a one-day task.

## Files

### To create

- `functions/src/callable/getPublicGroupProfile.ts` — allowlist-filter callable
- `functions/src/__tests__/getPublicGroupProfile.test.ts` — claimed/unclaimed/private/allowlist-regression tests
- `web/src/lib/deepLinks.js` — `buildGroupDeepLink(id)`, `buildClaimDeepLink(id)`, `detectPlatform()`
- `web/src/components/GroupPageHead.js` — React Helmet wrapper + JSON-LD
- `web/src/components/GroupCallToAction.js` — claimed and unclaimed CTA variants

### To modify

- `web/src/pages/GroupProfilePage.js` — switch data source to callable, drop `memberCount`/`foundedDate` display, un-comment meetings, add head + CTA components, handle unclaimed state
- `web/package.json` — add `react-helmet-async`
- `web/src/index.js` — wrap `<App>` in `<HelmetProvider>`
- `functions/src/index.ts` — export `getPublicGroupProfile`
- `mobile/src/types/schema.ts` and `functions/src/entities/Group.ts` — add optional `publicProfileEnabled?: boolean`
- Group settings screen (mobile) — add toggle for `publicProfileEnabled` (admin-only)
- `firestore.rules` — no change

## Build Order

Each step is independently shippable.

1. **Callable + tests** — `getPublicGroupProfile` with allowlist and privacy filter
2. **`publicProfileEnabled` field + admin toggle** — schema addition plus mobile settings UI
3. **Rewire `GroupProfilePage.js`** — switch data source, drop leaked fields, restore meetings, add unclaimed-state UI
4. **Meta tags + Schema.org** — add `react-helmet-async`, wire `GroupPageHead`, `noindex` on unclaimed
5. **Deep-link CTAs** — verify AASA / assetlinks files, wire Universal Links for open and claim, platform-detected App Store redirect for download
6. **Manual verification** — share URLs to iMessage/Slack/Twitter for preview; test Universal Link with and without app installed on both iOS and Android

## Out of Scope (Phase 1)

- SSR via Cloud Functions — deferred to Phase 2 when organic traffic justifies it
- Admin-controlled per-field privacy granularity — defer to V2
- Analytics on public-page visits — add post-launch with real traffic
- Structured data beyond basic `Organization` + `Event`

## Risks

- **AASA file may not be deployed.** `firebase.json` has the header configured, but the file itself at `web/public/.well-known/apple-app-site-association` must be verified. If missing, one-day addition.
- **Anonymous callable rate limiting.** The public callable has no per-IP throttle; a scraper could hammer it. Acceptable pre-launch given obscurity; add `firebase-functions-rate-limiter` or equivalent before real traffic.
- **Schema allowlist regression.** A future field added to the `groups` document could silently appear in the public response if the callable spreads the doc rather than explicitly picking fields. The allowlist-regression test guards against this; the callable must explicitly `pick()` fields, never spread.
