# Design: Comprehensive Unit Test Suites for Functions Codebase

**Date:** 2026-02-23
**Status:** Approved

## Overview

Add comprehensive unit test coverage for all active source files in `src/util/` and all Cloud Function modules (`src/callable/`, `src/triggers/`, `src/scheduled/`, `src/webhooks/`, `src/http/`). Also fix the critical `api/firestore.ts` service-key issue and delete `entities/WeeklyReport.ts`.

## Phase 1: Critical Fixes

Fix before tests are written so that test imports resolve cleanly.

- **`src/api/firestore.ts`** — Remove `admin.initializeApp()` with `service-key.json`. Replace with `admin.app()` (default runtime-provided app). All `ratsFirestore` and collection refs switch to `admin.firestore()`.
- **`entities/WeeklyReport.ts`** — Delete file.

## Phase 2: Unit Tests — `src/util/` (10 active files)

Test strategy: mock all external dependencies (Firebase Admin, Axios, third-party packages). Test pure logic directly.

| File | Key things to test |
|------|-------------------|
| `meetings.ts` (585 lines) | Entity mapping (AA/NA/CR meetings), distance filtering, day filtering, geohash queries |
| `disputes.ts` (298 lines) | Dispute state transitions, runDisputeTransaction logic |
| `guest.ts` (264 lines) | transferStats, guest stat calculations |
| `location.ts` (110 lines) | getDistance, getGeohashRange, getAddressFromGeocode |
| `notifications.ts` (107 lines) | sendNotification, push payload construction |
| `date.ts` (120 lines) | daysOfWeek, date helpers, timezone calculations |
| `email.ts` | sendEmail, regroupEmail, template construction |
| `claims.ts` | createClaims, deleteClaim, claim shape |
| `user.ts` | _verifyUserEmail, getGuestsAsUsers |
| `invite.ts` | notifyAdminsIfTheyExist, invite logic |
| `week.ts` | week calculation helpers |

## Phase 3: Unit Tests — Cloud Functions

Test strategy: mock firebase-admin, firebase-functions (already established in `payments.test.ts`). Test auth guards, input validation, business logic, and error paths.

| Module | Functions | Key things to test |
|--------|-----------|-------------------|
| `callable/auth.ts` | 7 auth functions | Auth guards, claim creation/deletion, error cases |
| `callable/houses.ts` | addNewHouseAdmin, searchForHouses | Input validation, Firestore interactions |
| `callable/meetings.ts` | findMeetings, userIsAtMeeting, narcoticsAnonymousMeetings, getCurrentAddress | Location search, distance logic |
| `callable/payments.ts` | createPaymentIntent, listPayments, savePaymentMethod, connectStripeAccount, disconnectStripeAccount, getStripeAccountStatus | Stripe mocking, auth guards, error surfacing |
| `callable/subscriptions.ts` | 10 functions | Stripe subscription CRUD, email invites |
| `triggers/firestore.ts` | 7 triggers | Firestore change handlers, notification dispatch |
| `triggers/rtdb.ts` | dmNotification | RTDB write handler |
| `scheduled/index.ts` | 7 scheduled functions | Dispute resolution, weekly transfer logic |
| `webhooks/stripeWebhook.ts` | stripeEvents, handleStripeConnectWebhook | Webhook signature verification, event routing |
| `http/stripeConnect.ts` | stripeConnectReauth, stripeConnectReturn | HTTP handler redirects |
| `http/universal.ts` | universal | HTTP routing |

## Testing Approach

- **Framework:** Jest + ts-jest (already configured)
- **Mock pattern:** Follow existing `payments.test.ts` mock pattern for firebase-admin and firebase-functions
- **File naming:** `src/__tests__/<module>/<file>.test.ts`
- **Coverage target:** All exported functions, all auth guard paths, all error paths
- **No integration tests** — unit tests only, all I/O mocked

## Parallelization Plan

Tasks can be batched into parallel subagent groups:

**Batch 1 (sequential prerequisite):** Critical fixes
**Batch 2 (parallel):** util tests — meetings+disputes+guest | location+notifications+date | email+claims+user+invite+week
**Batch 3 (parallel):** callable tests — auth+houses | meetings | payments | subscriptions
**Batch 4 (parallel):** triggers+scheduled+webhooks+http tests
**Batch 5:** Final verification — run full test suite, confirm all pass
