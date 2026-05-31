---
name: new-callable
description: Scaffold a new Firebase Cloud Functions v2 callable following the established project pattern. Invoke with the function name as the argument, e.g. /new-callable updateSubscriptionX.
---

# New Callable Scaffold

Create a new callable function in `functions/src/callable/` following the project's
established conventions. Every callable in this repo must follow this exact pattern.

## Argument

The argument is the new function's camelCase name (e.g. `updateSubscriptionX`).

## Required Pattern

Every callable MUST include all of the following, in this order:

1. **Imports** — `onCall`, `HttpsError` from `firebase-functions/v2/https`; named secrets from `../config`; Zod; named lodash imports; `getUser`/`updateUser` from `../api/firestore`; Stripe helpers from `../api/stripe` if needed.

2. **Zod schema** — strip unknown keys (no `.passthrough()`). Always include `ownerUserId: z.string().min(1)`.

3. **`onCall` wrapper** — pass the correct secrets array (e.g. `{ secrets: [STRIPE_SECRET_KEY] }`).

4. **Auth guard** — first line inside the handler:

   ```ts
   if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
   ```

5. **`parseInput`** — always use `parseInput(schema, request.data)`, never call `.parse()` directly.

6. **UID match guard** — verify the caller owns the resource:

   ```ts
   if (data.ownerUserId !== request.auth.uid)
     throw new HttpsError("permission-denied", "User ID mismatch");
   ```

7. **Firestore read** — use `getUser(ownerUserId)` from `../api/firestore`, never raw admin SDK.

8. **Guard missing metadata** — always check before accessing subscription fields:

   ```ts
   if (!user.subscriptionMetadata || !user.subscriptionMetadata.items) {
     logger.warn("User has no subscription metadata, skipping");
     return;
   }
   ```

9. **Stripe-first ordering** — update Stripe before writing to Firestore. If Stripe
   fails, Firestore is not touched.

10. **Catch block with HttpsError re-throw** — first line of every catch:
    ```ts
    if (error instanceof HttpsError) throw error;
    ```

## Template

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { STRIPE_SECRET_KEY } from "../config";
import { parseInput } from "../validation";
import { getUser, updateUser } from "../api/firestore";
import {
  getSubscriptionItem,
  updateSubscriptionItem,
  updateSubscriptionMetadata,
} from "../api/stripe";

// ── Schema ────────────────────────────────────────────────────────────────────
const {{FunctionName}}Schema = z.object({
  ownerUserId: z.string().min(1),
  action: z.enum(["add", "remove"]),
  // TODO: add fields specific to this callable
});

// ─────────────────────────────────────────────────────────────────────────────
// {{functionName}}
// ─────────────────────────────────────────────────────────────────────────────
export const {{functionName}} = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");

    const data = parseInput({{FunctionName}}Schema, request.data) as {
      ownerUserId: string;
      action: "add" | "remove";
    };

    if (data.ownerUserId !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");

    logger.info("{{functionName}}: start", { userId: data.ownerUserId });

    const user = await getUser(data.ownerUserId);

    if (!user.subscriptionMetadata || !user.subscriptionMetadata.items) {
      logger.warn("{{functionName}}: no subscription metadata, skipping");
      return;
    }

    try {
      // TODO: Stripe operations first
      // e.g. await updateSubscriptionItem(itemId, "guest", newQuantity);

      // TODO: Firestore write after Stripe succeeds
      // e.g. await updateUser(user.id!, { subscriptionMetadata: ... });

      logger.info("{{functionName}}: complete");
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("{{functionName}}: error", error);
      throw new HttpsError("internal", "Operation failed");
    }
  },
);
```

## After Scaffolding

1. Replace all `{{functionName}}` / `{{FunctionName}}` with the actual name.
2. Export the function from `functions/src/index.ts`.
3. Add a test file at `functions/src/__tests__/callable/{{functionName}}.test.ts`
   following the pattern in `subscriptions.test.ts` (mock `getUser`, `updateUser`,
   Stripe helpers; test auth guard, UID mismatch, metadata guard, and success path).
4. Run `npm test` to confirm 0 failures.
