# Privacy Policy

**Regroup (RATS Recovery App)**
Last updated: May 21, 2026

---

## 1. Introduction

Regroup ("we," "us," or "our") operates the RATS Recovery App ("App"), a mobile application and web platform designed to help sober living house operators and residents track accountability, manage house operations, and support long-term recovery.

This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App. Please read this policy carefully. If you disagree with its terms, please discontinue use.

---

## 2. Information We Collect

### 2.1 Account and Identity Information

When you register, we collect:

- Name, email address, and phone number
- Account type (operator/admin or resident/guest)
- Authentication credentials (managed securely via Firebase Authentication)

### 2.2 House and Residency Information

Operators provide:

- House name, address, and capacity
- Rent and program fee amounts
- Phase/level requirements for residents

Residents provide:

- Sobriety date and program type (AA, NA, SMART Recovery, etc.)
- Current living situation and references (during the application process)

### 2.3 Accountability Tracking Data

The core function of the App requires collecting:

- Meeting attendance logs (date, type, count)
- Chore completion records
- Work hours logged
- Medication adherence (yes/no per day — no medication names or dosages)
- Sponsor/supporter contact records

### 2.4 Payment Information

We use **Stripe** to process rent payments. We do not store full payment card numbers. Stripe stores and processes card data under PCI-DSS compliance. We retain:

- Payment status and amount
- Payment timestamps and descriptions
- Stripe customer and subscription IDs (internal reference only)

### 2.5 Communications

- House chat messages between residents and operators
- Direct messages between users
- In-app notifications (payment due, compliance alerts, application status)

### 2.6 Application Data

Prospective residents submit:

- Name, email, phone
- Sobriety date and program type
- Current situation description
- References

### 2.7 Usage and Technical Data

- Device identifiers (for push notifications via Firebase Cloud Messaging)
- App crash reports and error logs (via Sentry — no personally identifiable content in stack traces)
- App usage analytics to improve the product

---

## 3. How We Use Your Information

We use the information we collect to:

- **Operate the App** — display accountability dashboards, payment history, and house information
- **Process payments** — collect and record rent payments via Stripe
- **Send notifications** — push notifications for payment due dates, compliance flags, and house updates
- **Support Oxford House governance** — votes, officer rosters, EES records (only for Oxford-enabled houses)
- **Improve the App** — analyze usage patterns to fix bugs and build new features
- **Fulfill legal obligations** — respond to lawful requests and comply with applicable regulations

We do not sell your personal information to third parties.

---

## 4. Information Sharing

We share information only in the following circumstances:

### 4.1 Within Your House

Resident accountability data (meeting counts, chore completion, work hours) is visible to operators and other authorized admins of your house. Residents can view their own records.

### 4.2 Service Providers

We use the following third-party processors under data processing agreements:

| Service                                            | Purpose                                      | Privacy Policy                                                                     |
| -------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Google Firebase (Firestore, Auth, Cloud Messaging) | Database, authentication, push notifications | [firebase.google.com/support/privacy](https://firebase.google.com/support/privacy) |
| Stripe                                             | Payment processing                           | [stripe.com/privacy](https://stripe.com/privacy)                                   |
| Sentry                                             | Error monitoring                             | [sentry.io/privacy](https://sentry.io/privacy)                                     |

### 4.3 Legal Requirements

We may disclose information if required by law, court order, or to protect the safety of our users or the public.

### 4.4 Business Transfers

In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity under confidentiality obligations.

---

## 5. Health-Adjacent Data

The App collects accountability data related to recovery programs (sobriety date, meeting attendance, medication adherence). This data is **not** protected health information (PHI) as defined by HIPAA — it does not include diagnoses, treatment plans, or clinical data. However, we treat it with heightened care:

- Access is restricted to authorized house operators
- Data is not shared with third parties for advertising
- Residents retain access to their own records

**Note:** If you believe your use case may involve clinical or diagnostic data, consult with a legal advisor about HIPAA applicability before deploying this App.

---

## 6. Data Retention

| Data Type               | Retention                                 |
| ----------------------- | ----------------------------------------- |
| Active account data     | Until account deletion                    |
| Accountability logs     | Until account deletion or house departure |
| Payment records         | 7 years (IRS/accounting requirements)     |
| Application submissions | 90 days after decision                    |
| Chat messages           | Until account deletion                    |
| Error logs (Sentry)     | 90 days                                   |

---

## 7. Your Rights

Depending on your location, you may have the right to:

- **Access** — request a copy of your personal data
- **Correction** — request correction of inaccurate data
- **Deletion** — request deletion of your account and personal data
- **Portability** — receive your data in a machine-readable format
- **Opt-out of push notifications** — via device settings at any time

To exercise any of these rights, contact us at **privacy@regroup.app**.

Residents should direct requests to their house operator first, as operators control house-level data.

---

## 8. Children

The App is intended for adults aged 18 and over. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us with personal information, contact us immediately and we will delete it.

---

## 9. Security

We implement technical and organizational measures to protect your information:

- All data in transit is encrypted via HTTPS/TLS
- Firestore security rules enforce role-based access at the database level
- Payment data is handled exclusively by Stripe (PCI-DSS Level 1)
- Firebase Authentication manages all password hashing and session security
- Access to production systems is restricted to authorized personnel

No system is completely secure. If you discover a security vulnerability, please report it to **security@regroup.app** rather than disclosing it publicly.

---

## 10. Push Notifications

We use Firebase Cloud Messaging to send push notifications about payment due dates, compliance reminders, and house updates. You can opt out at any time through your device settings (iOS: Settings → Notifications → Regroup; Android: Settings → Apps → Regroup → Notifications).

---

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of material changes via in-app notification or email at least 30 days before the change takes effect. Your continued use of the App after the effective date constitutes acceptance.

---

## 12. Contact

For privacy questions or to exercise your rights:

**Regroup / RATS Recovery App**
Email: privacy@regroup.app

---

_This document is a working draft for legal review. It does not constitute legal advice. Have a qualified attorney review this policy before publishing it on the App Store or making it available to users._
