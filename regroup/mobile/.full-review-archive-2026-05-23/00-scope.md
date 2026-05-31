# Review Scope

## Target

Full application review of the RATS (Regroup App for Transitional/Sober Living) — a React Native mobile application for managing sober living houses. The app handles guest management, house operations, payments (Stripe), Oxford House governance (business meetings, voting, officers, EES), activity tracking, notifications, and compliance monitoring.

## Technology Stack

- **Frontend**: React Native (TypeScript)
- **Backend**: Firebase (Firestore, Auth, Cloud Functions)
- **State Management**: Redux Toolkit + React Query (TanStack Query)
- **Payments**: Stripe integration
- **Testing**: Jest (unit), Detox (E2E)
- **Navigation**: React Navigation

## Files

### Source Code (666 files, excluding tests)

**Core Domains:**

- `src/screens/` — 30+ screen modules (Activity, Beds, Complaints, Contacts, CreateGuest, DirectChat, Disputes, GuestList, HouseSettings, Oxford, Payments, RentPayment, SetupWizards, etc.)
- `src/services/` — Business logic and Firebase operations (activity, payments, oxford/, notifications/, etc.)
- `src/state/` — Redux slices + React Query hooks (queries/, slices/, selectors/)
- `src/entities/` — Data models (Guest, House, User, Oxford models, etc.)
- `src/components/` — 60+ reusable UI components
- `src/navigation/` — React Navigation setup and deep linking
- `src/hooks/` — Custom hooks (activity, offline sync, search, etc.)
- `src/util/` — Utilities (compliance, formatting, permissions, roles, etc.)
- `src/context/` — React contexts (Auth, Data, Modal, Notification)
- `src/config/` — Feature flags, Firebase emulator config

**Infrastructure:**

- `e2e/` — Detox E2E tests and helpers
- `functions/` — Firebase Cloud Functions (recently deleted/consolidated)
- `database.rules.json` — Firebase Realtime Database rules
- `firebase-setup.ts` — Firebase initialization

### Test Files (242 files)

- Unit tests colocated with source (`__tests__/` directories)
- Integration tests in `src/integration/`
- E2E tests in `e2e/tests/`

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: react-native (auto-detected)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
