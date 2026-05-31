# Regroup Sober Living App – MVP Functional Specification

This document describes the current (MVP) functional behavior of the Regroup Sober Living App so an LLM agent in Cursor can compare the running codebase with product expectations and later diff it against a "fully featured" future spec.

---

## 1. Product Overview

Regroup is a mobile app for sober living homes that combines house management, resident accountability, and recovery support into a single system used by both managers and residents.
The MVP assumes one shared app binary (iOS/Android) with role-based behavior (manager vs resident) rooted in the same core entities: homes, residents, beds, chores, meetings, sponsors, work logs, phases, disputes, issues, and messages.

---

## 2. Core Domain Model (Conceptual)

Key domain entities the codebase is expected to model:

- Home: A sober living property with configuration, rooms, beds, managers, residents, phases, and communication channels.
- Room/Bed: Physical slots within a home; each bed can be assigned to at most one active resident at a time.
- Resident: A user associated with one or more homes, with current phase, chore assignments, meeting and work logs, sponsor info, disputes/issues, and messaging threads.
- Manager: A user with elevated permissions over one or more homes (may also be a resident with a managerial role).
- Chore: A recurring or one-off task associated with a home and optionally assigned to specific residents, with completion and audit log.
- Meeting: A recovery meeting with location, time, type, and metadata enabling search and GPS-based check‑in.
- Sponsor: A relationship record holding sponsor contact and step progression for a resident.
- Work Entry: A log of a resident's job/employment and daily work activity.
- Phase: A named stage (e.g., "Contract", "No Contract") with configured requirements applied to residents.
- Activity Log Entry: Normalized events for chore completion, meeting attendance, work completion, etc.
- Dispute: An anonymized, resident‑initiated report about another resident's behavior.
- Issue: A maintenance or safety problem associated with a home, with status tracking.
- Message/Thread: Communication objects for group chat and direct messaging.

---

## 3. House Configuration and Structure

### 3.1 Homes and Setup

- The app supports a "fully configurable setup": owners can create one or more homes, each with its own configuration (phases, rules, managers).
- For each home, the owner can define rooms and beds; beds are assignable to residents, enabling occupancy and availability tracking.

Expected code implications:

- Persistent models for homes, rooms, beds, and ownership/manager relationships. **✓ Implemented**
- Validation that beds cannot be double‑booked for overlapping date ranges. **⚠️ PARTIAL: Bed reassignment logic prevents double-booking at a single point in time, but date-range overlap validation for historical tracking is not explicitly implemented**

### 3.2 Phases and Requirements

- Each home can define multiple phases (e.g., "Contract", "No Contract"), with associated requirements such as expected meetings per week, chore participation, curfew rules, or other configurable conditions.
- Each resident in a home is assigned a current phase, and phase changes should be auditable.

---

## 4. Resident Responsibilities and Daily Routines

### 4.1 Chores

- Managers can create chores scoped to a home, optionally assign them to specific residents. **✓ Implemented**
- Residents see their assigned chores, mark them as completed, and the system logs completion events into the Activity Log. **✓ Implemented**

Expected behavior:

- Chore completion should record who completed it and when. **✓ Implemented via Activity entity with type 'chore_completed'**

**Note:** The current implementation assigns chores weekly via Guest.currentWeek.chore rather than supporting multiple frequency options (daily/weekly/one-off) with individual assignments per chore.

### 4.2 Work Tracking

- Residents can add jobs/employers and track work each day (e.g., hours worked, shift notes).
- Managers can view the resident's work history to understand employment stability and schedule.

---

## 5. Meetings and Sponsorship

### 5.1 Meeting Discovery and Check‑In

- The app provides meeting lists for most towns and cities in the United States, searchable by location and other filters. **✓ Implemented via `findMeetings` cloud function and meeting database (AA/NA meetings)**
- Residents can check into a meeting using GPS; the app verifies proximity to the meeting location when logging attendance. **✓ Implemented via `userIsAtMeeting` cloud function (200 meter acceptable distance)**

Expected behavior:

- Meeting attendance logs should include timestamp, meeting ID, location used for verification, and resident ID. **✓ Implemented via Activity entity with type 'meeting_attended' and metadata fields**

### 5.2 Sponsorship and Step Tracking

- Residents can maintain sponsor information (name, contact details) in the app. **✓ Implemented via Week.primarySupporterId and Week.primarySupporterName fields**
- Residents can log when they attend a meeting with their sponsor and track step progression (e.g., which step they are on and recent changes). **✓ Implemented via Activity type 'supporter_met' and Week.step field**

---

## 6. Activity Log and Accountability

### 6.1 Activity Log

- The app maintains an Activity Log aggregating events such as chore completion, meeting attendance, work completion, and other notable activities. **✓ Implemented via Activity entity with multiple ActivityType values**
- Managers can view Activity Log entries at the home level and per resident to assess engagement and compliance. **✓ Implemented**

### 6.2 Accountability System (Phases + Events)

- The combination of phases and Activity Log events acts as the MVP accountability layer, enabling staff to see whether residents meet configured requirements.
- Future versions may expand this into explicit "requirements rules," but the MVP at least provides the raw data and phase assignments.

---

## 7. Disputes and Issues

### 7.1 Dispute System

- Residents can "call each other out" using the Disputes feature to report behavior or rule violations. **✓ Implemented**
- Disputes are attached to a home and identify the reported resident, with status tracked by managers. **✓ Implemented via Dispute entity with houseId, guestId (victim), and activityId**

Expected behavior:

- Disputes track the reported activity and guest. **✓ Implemented: The current Dispute interface (src/entities/Dispute.tsx) does NOT store reporter identity - only guestId (the reported person), making disputes effectively anonymous from the reported person's perspective**

**Note:** The dispute system focuses on disputing specific activities rather than general behavior reporting. There is also a separate "Complaint" entity that may serve a different purpose.

### 7.2 Maintenance and Safety Issues

- Residents and managers can create Issues for problems such as maintenance needs or safety concerns within a home. **✓ Implemented via HouseIssue entity**
- Issues support status tracking and include description, category (type: 'maintenance' | 'house' | 'guest'), emergency flag, issuer, and resolver. **✓ Implemented**

**Note:** Issues track resolution status via `resolution` string and `resolver` fields, plus an `invalid` boolean flag, rather than explicit status enum (open/in progress/resolved).

---

## 8. Communication Features

### 8.1 House Group Chat

- Each home exposes at least one group chat channel where all house members and managers can send and read messages. **✓ Implemented via /houses/{houseId}/chat/ Firestore collection**
- Group chat messages are associated with a home and visible to all current members of that home. **✓ Implemented with Firestore security rules**

### 8.2 Direct Messaging

- Direct messaging allows 1:1 conversations between residents and managers or between residents. **✓ Implemented via DirectMessage entity and /direct-messages/{messageId}/chat/ collection**
- Messages are private to the participants and stored with timestamps and sender/receiver references. **✓ Implemented with Firestore security rules restricting access to senderId and recipientId**

---

## 9. Roles, Managers, and Access

### 9.1 Managers

- Home owners can invite additional managers to help manage a home. **✓ Implemented via House.adminIds, House.pendingAdminInvites, and House.seniorPeerEmails**
- A resident can also be given a managerial role within a home, granting them elevated permissions. **✓ Implemented via House.managerSetupType including 'senior-peer' option**

### 9.2 Permissions (Conceptual)

- Residents: view and complete their chores, log meetings/work, manage sponsor data, participate in chats, raise disputes and issues, see their own activity. **✓ Implemented via Firestore security rules and UI flows**
- Managers: configure homes, rooms, beds, phases, chores; review Activity Logs; manage disputes and issues; moderate chats; invite/remove residents and managers. **✓ Implemented via role-based access in Firestore rules**

---

## 10. House Search and Admission

- Homes using Regroup appear in an in‑app house search, allowing users to discover recovery homes. **✓ Implemented via HouseSearch entity with location-based search and filters (gender, type)**
- Prospective residents can apply to enter a home via the app; the MVP at minimum supports expressing interest and capturing contact/application details. **✓ Implemented via HouseApplication entity and House.applications collection**

---

---

## 11. Implementation Status Summary

**Last Verified:** November 29, 2025

### Core Features - Fully Implemented ✓

- **Entity Models**: All core entities exist (House, Guest, Room/Bed, Activity, Dispute, Issue, Meeting, Message, Chore, Phase, Job)
- **GPS Meeting Verification**: Working with 200-meter proximity check via cloud function
- **Activity Logging**: Comprehensive tracking with multiple activity types
- **House & Group Chat**: Implemented with proper security rules
- **Direct Messaging**: Peer-to-peer and manager-resident messaging functional
- **Bed Assignment**: Room and bed management with guest assignment
- **Dispute System**: Activity-based disputes (does NOT store reporter identity - effectively anonymous)
- **Issue Tracking**: Maintenance and safety issue reporting
- **House Search**: Location-based search with filters
- **Phase System**: Configurable phases with requirements (meetings, work hours, curfew, chores)
- **Sponsor Tracking**: Primary supporter and step progression

### Implementation Variations

1. **Chore Assignment**: Currently assigns one chore per week via `Guest.currentWeek.chore` rather than supporting multiple chores with varied frequencies (daily/weekly/one-off)

2. **Bed Overlap Validation**: Bed reassignment prevents double-booking at a single point in time, but date-range overlap validation for historical tracking is not explicitly implemented

3. **Issue Status**: Uses `resolution` string, `resolver`, and `invalid` boolean rather than an explicit status enum (open/in progress/resolved)

4. **Dispute Anonymity**: Current implementation does NOT store reporter identity in the Dispute entity, making disputes effectively anonymous. There is also a separate Complaint entity for different use cases.

### Architecture Notes

- **Week-Based Data**: Guest data is organized around Week entities (currentWeek, previousWeek, nextWeek) with embedded Day entities for daily stat tracking
- **Firebase Firestore**: All persistence with security rules enforcing role-based access
- **Cloud Functions**: Key operations like meeting verification, dispute processing, and weekly reports
- **React Native**: Cross-platform mobile app (iOS/Android) with shared codebase

---

## 12. Intended Use in Cursor

For the LLM agent in Cursor:

- Treat each section above as the functional "source of truth" for the MVP feature set and behavior, independent of implementation details.
- Compare the existing codebase (models, services, API handlers, UI flows) to ensure:
  - Every described entity exists with minimally appropriate fields.
  - Every described workflow (e.g., GPS meeting check‑in, anonymous disputes, bed assignment) has a coherent end‑to‑end implementation.
  - Permissions align with role expectations and no critical flows are missing.

This document is not a comprehensive future roadmap; it is deliberately constrained to the current MVP so differences against a separate "fully featured" spec will be explicit and machine‑diffable.
