# Mobile App

This directory contains the React Native (TypeScript) mobile app for Homegroups (iOS + Android). Loaded by Claude Code automatically when working inside `mobile/`. See `../CLAUDE.md` for project-wide rules.

## Commands

```bash
npm test                              # Run Jest unit tests
npm test -- --testPathPattern=<name>  # Run a single test file
npm run lint                          # ESLint
npm start                             # Metro
npm run ios                           # NOTE: script pins a simulator UDID; use npx react-native run-ios locally
npm run android                       # Run on Android emulator
```

E2E tests use Detox:

- iOS: `npm run test:e2e:build` then `npm run test:e2e:test`
- Android: `npm run test:e2e:build:android` then `npm run test:e2e:test:android`

Firebase modules are mocked in `jest.setup.js`. Maestro flows: `maestro/flows/`. The Android CI job `homegroups-maestro-smoke` builds the debug APK and runs `invite-code-join.yaml` with `continue-on-error: true`, so it goes red only on a build failure; see `maestro/CI-CLOUD-SETUP.md`. On RN 0.72 the build relies on `android/build.gradle` setting each module's Java level (17 for `react-native-firebase*`, 11 otherwise) and on exact pins for gesture-handler, image-picker, screens, permissions and stripe-react-native. Lift both after the RN 0.76+ upgrade. Import the clipboard only from `@react-native-clipboard/clipboard`.

## Architecture

Three layers under `src/`:

- **Models** (`src/models/`, 15 models): Firestore data-access layer (`GroupModel`, `UserModel`, etc.). All direct Firestore reads/writes go through here.
- **Store slices** (`src/store/slices/`, 26 slices): Redux Toolkit slices with entity adapters. Slices call models via `createAsyncThunk` — never call Firestore directly from a slice. **Known drift:** ~12 slices and ~30 screens currently bypass this and call Firestore directly (tracked in the 2026-07-07 codebase review); treat this as the target pattern for new code, not a universally-enforced invariant yet.
- **Screens** (`src/screens/`): UI organized by domain (`auth/`, `homegroup/`, `intergroup/`, `meetings/`, `messages/`, `moderation/`, `onboarding/`, `profile/`, `sponsorship/`, `subscription/`, `announcements/`, `admin/`).

Other directories: `navigation/`, `types/` (`schema.ts` = Firestore doc shapes), `theme/`, `utils/`.

### Navigation

React Navigation with nested navigators: `AppNavigator` → `AuthNavigator` or `MainTabNavigator` → `GroupStackNavigator`, `MessagesNavigator`, `ProfileNavigator`, `IntergroupNavigator` (files in `src/navigation/`).

## Domain Rules

### DirectMessage type

The `sentAt` field is a Unix timestamp (`number`), not a `Date` or Firestore `Timestamp`. Defined in `src/types/index.ts` (`DirectMessage`); the Firestore doc types in `src/types/schema.ts` (`DirectMessageDocument`) use `Timestamp`.

### QR Code Meeting Check-In

- `src/screens/homegroup/MeetingQRCodeScreen.tsx` generates a deep link URL for a specific meeting on the current day and renders it as a QR code for secretaries to share.
- Deep link format: `recoveryconnect://checkin?groupId=G&meetingId=M&date=YYYY-MM-DD`. The `checkInToMeeting` callable processes the actual check-in. (The `recoveryconnect://` URL scheme is a legacy identifier tied to native iOS/Android registration and `org.recoveryconnect`; the canonical product name is **Homegroups**. Don't change the scheme without updating native config and store listings.)
- Attendance lives in the top-level Firestore collection `meetingInstances`. Key fields: `meetingId` (string), `groupId` (string), `scheduledAt` (Timestamp), `attendees` (array of UIDs), `attendeeCount` (number, denormalized).
- The screen subscribes to today's `meetingInstances` doc and renders a live attendee count from the snapshot.
- Required composite index on `meetingInstances`: (`groupId ASC`, `attendees CONTAINS`, `scheduledAt DESC`) — defined in `../firestore.indexes.json`.

**Trust model (U-8):** the deep link is **unsigned** — anyone can forge a QR code. `checkInToMeeting` defends by requiring auth (the attendee is `request.auth.uid`, not the QR payload), membership of `groupId` (`members/{groupId}_{userId}`), and today's date only. A group member can still self-check-in without being present; the policy is "members are trusted within their group." If compliance reporting needs proof of attendance, HMAC-sign the QR payload and verify in the callable.

### Facility Dashboard (mobile entry)

`src/screens/intergroup/FacilityDashboardScreen.tsx` is the mobile entry point. Calls the `getFacilityEngagementMetrics`, `getFacilityStats`, and `exportFacilityComplianceReport` callables (see `../functions/CLAUDE.md`).

## Skills

Use the root skill `homegroups-run-mobile` to launch the simulator and take screenshots.
