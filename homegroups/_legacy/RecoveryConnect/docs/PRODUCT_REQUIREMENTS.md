> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Product Requirements (MVP)

**Last updated:** 2026-02-05  
**Product:** RecoveryConnect / Homegroups

This document is the canonical product-level MVP scope and replaces older overlapping drafts:
- `docs/spec.md`
- `docs/mvp-reqs.md`
- `docs/llm-context.md`
- `docs/FEATURE_GAPS_ANALYSIS.md` (historical analysis; superseded)

---

## Goal

Provide a privacy-first, group-centric mobile app that helps 12-step homegroups run smoothly:
- keep meeting info accurate
- communicate reliably (announcements + messaging)
- manage group treasury with continuity across rotating service positions
- support member engagement without compromising anonymity

---

## Target users

- **Members**: want accurate meeting info, official announcements, and simple community connection.
- **Group admins / trusted servants**: need tools for meeting updates, treasury, roles, and coordination.
- **Customer support / super admins**: need minimal governance + abuse handling workflows (MVP: manual CS escalation).

---

## Core principles / constraints

- **Privacy-first defaults**: minimize personal data, avoid lock-screen sensitive content, user-controlled sharing.
- **Anonymity-respecting UX**: first name / initial display options; avoid “social network” dynamics.
- **Reliability over novelty**: meeting info and announcements must be correct and timely.
- **App store compliance**: account deletion, privacy policy/terms accessibility, accurate security claims.

---

## MVP scope (capabilities)

### Meetings
- Search/browse meetings and view details (location, time, format, directions)
- Personal meeting favorites / schedule (MVP or fast-follow depending on readiness)

### Groups
- Create/join groups
- Member directory with role labels and privacy controls
- Group meeting schedule + meeting detail visibility for members

### Communication
- **Announcements**: admin-only posting, member read access, push notifications
- **Messaging**:
  - Group chat (group-scoped)
  - 1:1 direct messages (thread-scoped)
  - Attachments, reactions, reply (as supported)

### Treasury (group subscription value driver)
- Income/expense entry with categories
- Current balance + prudent reserve visibility
- Report generation suitable for business meetings
- Treasurer handoff / continuity tooling

### Safety & governance
- Content/user reporting + moderation actions (ban/warn/remove admin, etc.)
- Admin governance escalation flow (MVP manual CS resolution)

---

## Monetization

- **Free tier**: members (non-admin) can use core meeting/group participation features.
- **Group subscription**: **$12/year per group** for admin tooling + operational features.

See `docs/PRICING_MODEL.md` and `docs/BILLING_AND_PAYMENTS.md`.

---

## Out of scope for MVP (explicit non-goals)

- Automated governance/voting systems (beyond manual CS workflow)
- Sophisticated tiering / per-member pricing
- Full end-to-end encrypted messaging (only claim what’s implemented)
- Marketplace-style donations provider swaps (e.g., Braintree) unless explicitly prioritized
