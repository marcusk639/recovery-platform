# Mobile App

This directory contains the React Native (TypeScript) mobile app for Homegroups (iOS + Android). Loaded by Claude Code automatically when working inside `mobile/`. See `../CLAUDE.md` for project-wide rules.

## Commands

```bash
npm test                              # Run Jest unit tests
npm test -- --testPathPattern=<name>  # Run a single test file
npm run lint                          # ESLint
react-native run-ios                  # Run on iOS simulator
react-native run-android              # Run on Android emulator
```

E2E tests use Detox:

- iOS: `npm run test:e2e:build` then `npm run test:e2e:test`
- Android: `npm run test:e2e:build:android` then `npm run test:e2e:test:android`

Firebase modules are mocked in `jest.setup.js`.

## Architecture

Three layers under `src/`:

- **Models** (`src/models/`, 16 models): Firestore data-access layer (`GroupModel`, `UserModel`, etc.). All direct Firestore reads/writes go through here.
- **Store slices** (`src/store/slices/`, 26 slices): Redux Toolkit slices with entity adapters. Slices call models via `createAsyncThunk` — never call Firestore directly from a slice.
- **Screens** (`src/screens/`): UI organized by domain (`auth/`, `homegroup/`, `intergroup/`, `meetings/`, `messages/`, `moderation/`, `onboarding/`, `profile/`, `sponsorship/`, `subscription/`, `announcements/`, `admin/`).

Other directories: `navigation/`, `types/` (`schema.ts` = Firestore doc shapes), `theme/`, `utils/`.

### Navigation

React Navigation with nested navigators: `AppNavigator` → `AuthNavigator` or `MainTabNavigator` → domain navigators (`GroupNavigator`, `GroupStackNavigator`, `GroupTabNavigator`, `MessagesNavigator`, `ProfileNavigator`, `IntergroupNavigator`).

## Domain Rules

### DirectMessage type

The `sentAt` field is a Unix timestamp (`number`), not a `Date` or Firestore `Timestamp`. Defined in `src/types/schema.ts`.

### QR Code Meeting Check-In

- `src/screens/homegroup/MeetingQRCodeScreen.tsx` generates a deep link URL for a specific meeting on the current day and renders it as a QR code for secretaries to share.
- Deep link format: `recoveryconnect://checkin?groupId=G&meetingId=M&date=YYYY-MM-DD`. The `checkInToMeeting` callable processes the actual check-in. (The `recoveryconnect://` URL scheme is a legacy identifier tied to native iOS/Android registration and `org.recoveryconnect`; the canonical product name is **Homegroups**. Don't change the scheme without updating native config and store listings.)
- Attendance lives in the top-level Firestore collection `meetingInstances`. Key fields: `meetingId` (string), `groupId` (string), `scheduledAt` (Timestamp), `attendees` (array of UIDs), `attendeeCount` (number, denormalized).
- The screen subscribes to today's `meetingInstances` doc and renders a live attendee count from the snapshot.
- Required composite index on `meetingInstances`: (`groupId ASC`, `attendees CONTAINS`, `scheduledAt DESC`) — defined in `../firestore.indexes.json`.

**Trust model (U-8):** the deep link is **unsigned** — anyone who knows the URL format can forge a QR code and call `checkInToMeeting`. The callable's defenses are:

1. **Auth required**: caller must be signed in as a Firebase user (`request.auth?.uid` is the attendee on record, not anything from the QR payload).
2. **Group membership**: caller must be a member of `groupId` (checked server-side via `members/{groupId}_{userId}`).
3. **Today's date only**: the callable rejects `date` values that aren't `YYYY-MM-DD` for "today" in the meeting's timezone.

What this **does not** protect against: a member of the group can self-check-in to any meeting on the day's schedule without physically being there. The model accepts this — the policy is "members are trusted within their group." If facility-dashboard compliance reporting (the Regroup endpoint, paid alumni networks) ever needs cryptographic proof of attendance, sign the QR payload with an HMAC keyed to `meetingId + scheduledAt` and verify in the callable.

### Facility Dashboard (mobile entry)

`src/screens/intergroup/FacilityDashboardScreen.tsx` is the mobile entry point. Calls the `getFacilityEngagementMetrics`, `getFacilityStats`, and `exportFacilityComplianceReport` callables (see `../functions/CLAUDE.md`).

## Mobile-Local Skills

`.claude/skills/run-homegroups-mobile/` provides a `run-homegroups-mobile` skill for launching the iOS simulator and taking screenshots. Active automatically when Claude is working in `mobile/`.
