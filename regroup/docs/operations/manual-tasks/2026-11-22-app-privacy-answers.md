# Regroup: App Privacy and Data safety answers

**For:** the owner, at go-live runbook step B3 (`2026-11-22-launch-go-live.md`), when filling in App Store Connect → App Privacy and Play Console → Data safety.
**Matches:** `regroup/mobile/ios/rats/PrivacyInfo.xcprivacy` as of this commit. If you answer differently in either console, change the manifest to match, or App Review can flag the mismatch.
**Also keep in step with:** the privacy policy (runbook B2). Today it omits drug tests, documents, medication names and SendGrid (ledger ST-12, ST-13).

## Answers

The same for every row: **not used for tracking**, and no data is sold or shared with third parties for advertising.

| App Store Connect data type            | Linked to the user | Purposes                     | What it is in Regroup (evidence)                                                                                                       |
| -------------------------------------- | ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info → Name                    | Yes                | App Functionality            | Resident and staff names (`mobile/src/entities/Guest.tsx`, sign-up)                                                                    |
| Contact Info → Email Address           | Yes                | App Functionality            | Sign-in and invitations (Firebase Auth; `functions/src/util/inviteEmails.ts`)                                                          |
| Contact Info → Phone Number            | Yes                | App Functionality            | Profile and intake phone number                                                                                                        |
| Health & Fitness → Health              | Yes                | App Functionality            | Sobriety date, drug of choice, drug-test results, medication names and doses (`entities/DrugTest.ts`, `entities/ActivityModel.ts:226`) |
| Financial Info → Payment Info          | Yes                | App Functionality            | Card and bank details entered for rent, held by Stripe (`@stripe/stripe-react-native`)                                                 |
| Financial Info → Other Financial Info  | Yes                | App Functionality            | Rent owed, payment history, fees                                                                                                       |
| User Content → Emails or Text Messages | Yes                | App Functionality            | House chat and direct chat (`screens/HouseChat`, `screens/DirectChat`)                                                                 |
| User Content → Photos or Videos        | Yes                | App Functionality            | Profile photos and chore photos (camera and photo-library permissions in `ios/rats/Info.plist`)                                        |
| User Content → Other User Content      | Yes                | App Functionality            | Uploaded documents, activity reports, intake answers                                                                                   |
| Identifiers → User ID                  | Yes                | App Functionality            | Firebase Auth uid                                                                                                                      |
| Identifiers → Device ID                | Yes                | App Functionality, Analytics | Push token (`screens/Splash/Splash.tsx:152`); Firebase Analytics app-instance id                                                       |
| Usage Data → Product Interaction       | Yes                | Analytics                    | The `signin` analytics event (`screens/Login/LoginForm.tsx:88`)                                                                        |
| Other Data → Other Data Types          | Yes                | App Functionality            | Legal status from intake, such as probation or parole (`screens/ResidentIntake/IntakeFormScreen.tsx`)                                  |
| Diagnostics → Crash Data               | No                 | App Functionality            | Sentry, with `sendDefaultPii: false` and no screenshots (`src/config/sentry.ts`)                                                       |
| Diagnostics → Performance Data         | No                 | App Functionality            | Sentry tracing at 20% (`tracesSampleRate: 0.2`)                                                                                        |

**Not collected: Location.** The app reads the device location only to search for houses and 12-step meetings near the user (`screens/HouseSearch/HouseSearchScreen.tsx:121`, `screens/StatUpdates/MeetingSearch/useMeetingSearch.ts:111`). The coordinates go with that one search and are not stored or logged, which Apple doesn't count as collection. If a later change stores or logs them, declare Location → Precise Location and add it to the manifest.

## Play Console Data safety

Use the same list. Play groups the types differently:

- **Personal info:** Name, Email address, Phone number, and "Other info" for legal status.
- **Health and fitness:** Health info.
- **Financial info:** "User payment info" (collected by Stripe), and "Other financial info".
- **Messages:** "Other in-app messages".
- **Photos and videos:** Photos.
- **Files and docs:** the uploaded documents.
- **App activity:** "Other user-generated content", and App interactions (the analytics event).
- **App info and performance:** Crash logs and Diagnostics.
- **Device or other IDs:** the push token and the analytics id.

For every type:

- **Encrypted in transit:** yes.
- **Users can request deletion:** yes. In-app account deletion covers it.
- **Shared with third parties:** no. Stripe, Sentry, SendGrid and Google act as service providers, which Play doesn't count as sharing.

**Expected result:** both consoles list exactly the types above, and App Review raises no manifest mismatch.
