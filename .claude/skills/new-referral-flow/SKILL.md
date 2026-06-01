---
name: new-referral-flow
description: Scaffold a cross-product referral through recovery-api. Use when one product needs to refer a user to another product (homegroups → regroup, detox → homegroups, etc.). Provides the correct POST /api/referrals payload schema, authentication pattern, and the forbidden anti-patterns to avoid.
---

## Cross-Product Referral Pattern

All cross-product user flows MUST go through `POST /api/referrals` on recovery-api.
Direct Firestore cross-queries are forbidden — see CLAUDE.md §Cross-Cutting Rules.

## Valid toApp Values

| toApp                | Product                      | Firebase Project         |
| -------------------- | ---------------------------- | ------------------------ |
| `treatment-center`   | detox-recovery (NextStep)    | `nextstep-recovery`      |
| `phoenix-cleanhouse` | regroup (RATS)               | `phoenix-cleanhouse`     |
| `homegroups`         | homegroups (RecoveryConnect) | `recovery-connect-cad4b` |

## Authentication

Client-side callers pass a Firebase ID token. The token must be from the **calling
product's** Firebase project — not a service account key.

```typescript
const token = await firebase
  .auth()
  .currentUser?.getIdToken(/* forceRefresh */ false);
```

Cloud Functions / Cloud Run service callers use the `X-Service-Key` header instead
(see service-to-service section below).

## Payload Schema (Zod-validated in recovery-api)

```typescript
{
  toApp: 'treatment-center' | 'phoenix-cleanhouse' | 'homegroups',
  referredUserId: string,   // UID in the calling product's Firebase project
  referredBy: string,       // UID of the user initiating the referral
  notes?: string            // optional clinical or contextual context
}
```

## Full Example — Client-Side (homegroups → regroup)

```typescript
// homegroups/mobile/src/services/referrals.ts

const RECOVERY_API_URL = process.env.RECOVERY_API_URL;

export async function referMemberToSoberLiving(
  memberUid: string,
  currentUserUid: string,
  notes: string,
): Promise<{ id: string }> {
  const token = await firebase.auth().currentUser?.getIdToken();
  if (!token) throw new Error("User not authenticated");

  const res = await fetch(`${RECOVERY_API_URL}/api/referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      toApp: "phoenix-cleanhouse",
      referredUserId: memberUid,
      referredBy: currentUserUid,
      notes,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Referral failed: ${res.status}`);
  }

  return res.json() as Promise<{ id: string }>;
}
```

## Full Example — Service-to-Service (Cloud Function → recovery-api)

```typescript
// regroup/functions/src/services/referrals.ts

export async function createReferral(payload: {
  toApp: "treatment-center" | "phoenix-cleanhouse" | "homegroups";
  referredUserId: string;
  referredBy: string;
  notes?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${process.env.RECOVERY_API_URL}/api/referrals`, {
    method: "POST",
    headers: {
      "X-Service-Key": process.env.RECOVERY_API_SERVICE_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Referral failed: ${res.status}`);
  }

  return res.json() as Promise<{ id: string }>;
}
```

## Never Do This

```typescript
// FORBIDDEN: bypasses recovery-api entirely
const regroupApp = admin.initializeApp(
  { projectId: "phoenix-cleanhouse" },
  "regroup-secondary",
);
await regroupApp.firestore().collection("guests").add(memberData);
// ^ Breaks data isolation between Firebase projects
```
