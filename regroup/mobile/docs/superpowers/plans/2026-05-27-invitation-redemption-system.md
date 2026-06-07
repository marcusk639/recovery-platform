# Invitation Redemption System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-supplied-payload invitation flow (CF trusts URL params → privilege escalation) with a server-issued opaque-token system, then harden `addAdminAuthorization` + `addGuestAuthorization` so neither can be used to grant claims for arbitrary houses.

**Architecture:** Server-issued, single-use, expiring tokens stored in a new `invitations/{token}` Firestore collection. Three new Cloud Functions:

- `createInvitation` — admin/owner-only; writes the doc and sends the email; returns the opaque token.
- `peekInvitation` — token-only auth; returns metadata for signup-form pre-fill.
- `redeemInvitation` — auth-required; verifies email match + expiry + single-use; sets claims using the doc's role+houseId (not from client input); marks redeemed.

Six phases land sequentially: **A** ships CFs + tests with zero mobile dep; **B** ships the new rules block; **C** wires mobile to peek+redeem with a backward-compat fallback (old URL payload still works); **D** migrates the inviter side to use `createInvitation`; **E** hardens the legacy CFs so neither can be abused; **F** removes the legacy URL-payload parser after a sunset window.

**Tech Stack:**

- Cloud Functions: TypeScript, `firebase-functions/v2/https`, `firebase-admin`, Zod for input validation, `crypto.randomBytes` for token generation, existing SendGrid send path.
- Firestore: server-only `invitations/{token}` collection; rules-unit-testing.
- Mobile: React Native, existing `services/setup-wizard.ts`, `screens/SignUp/SignUpForm.tsx`, `services/native-deep-links.ts`.
- Repos touched: `~/dev/regroup-functions/` (Phases A, E), `~/dev/Regroup/` (Phases B, C, D, F).

**Reference:** `.full-review/03-s2-cross-repo-audit.md` (Step 2 sketch).

---

## File Structure

### regroup-functions (CF repo, Phases A + E)

- **Create:** `functions/src/entities/Invitation.ts` — entity type + the redeem-state machine.
- **Create:** `functions/src/util/tokens.ts` — opaque-token generation helper.
- **Create:** `functions/src/util/inviteEmails.ts` — email-send helper extracted from the current `sendInviteEmails` body so `createInvitation` can reuse it without recreating the SendGrid plumbing.
- **Create:** `functions/src/callable/invitations.ts` — the three new callables (`createInvitation`, `peekInvitation`, `redeemInvitation`).
- **Modify:** `functions/src/index.ts` — re-export the three new callables.
- **Modify:** `functions/src/callable/auth.ts` — add owner/delegation gating to `addAdminAuthorization` and `addGuestAuthorization` (Phase E).
- **Create:** `functions/src/__tests__/callable/invitations.test.ts` — Jest test suite for the three new callables.
- **Modify:** `functions/src/__tests__/callable/auth.test.ts` — append deny-case + delegation-case tests for the hardened CFs (Phase E).

### Regroup (mobile + rules repo, Phases B + C + D + F)

- **Modify:** `firebase/firestore.rules` — add `match /invitations/{token}` block: server-only read+write (Phase B).
- **Modify:** `firebase/__tests__/firestore.rules.test.ts` — append `invitations` deny tests (Phase B).
- **Modify:** `src/services/native-deep-links.ts:87-129` — parser supports new `?token=` deep-link AND the legacy URL-payload format (Phase C); legacy branch removed (Phase F).
- **Create:** `src/services/invitations.ts` — thin wrappers around the three new CFs.
- **Modify:** `src/screens/SignUp/SignUpForm.tsx:166-225` — when invitation has `token`, call `redeemInvitation` + `peekInvitation`; otherwise fall back to legacy `addAdminAuthorization`/`addGuestAuthorization` (Phase C); legacy branch removed (Phase F).
- **Modify:** `src/services/setup-wizard.ts:43-148` — `sendAllInvites` + `createAdminInvite` + `createGuestInvite` call `createInvitation` instead of `createNewInviteLink + sendInviteEmails` (Phase D).
- **Modify:** `src/services/admin.tsx:60` and `src/services/invites.ts:5` — replace `sendInviteEmails` callsites with `createInvitation` (Phase D).
- **Modify:** `src/__tests__/...` — update mocks for the new flow (per phase).

---

## Conventions reused from the codebase

- **regroup-functions** uses `onCall` callables from `firebase-functions/v2/https`, Zod via `parseInput`, custom `HttpsError` codes, and `firebase-admin.firestore()` for server-side DB access (existing pattern in `callable/payments.ts:74`).
- **createClaims** in `functions/src/util/claims.ts` is the canonical claim-merger; it reads current claims, adds houseIds, returns the merged claim object. Both Phases A and E should reuse it.
- **Regroup services** wrap `functions.httpsCallable('name')(payload)` and return `result.data` (see `services/payments.ts`, `services/setup-wizard.ts`).
- **Firestore mock for Jest unit tests in CF repo** uses the `call(fn, data, auth)` helper at `__tests__/callable/auth.test.ts:52` — keep that pattern.

---

## Phase A: New Cloud Functions in `regroup-functions`

Each task is contained to the functions repo. None of these break mobile.

### Task 1: Entity + token util

**Files:**

- Create: `functions/src/entities/Invitation.ts`
- Create: `functions/src/util/tokens.ts`

- [ ] **Step 1: Create the Invitation entity**

  Write `functions/src/entities/Invitation.ts`:

  ```ts
  /**
   * Server-issued, single-use invitation token.
   *
   * The Firestore document ID equals the opaque token (so token lookup is a
   * direct doc-by-id read). The token itself is the only credential needed
   * to call peekInvitation/redeemInvitation — treat it as a bearer secret.
   */
  export type InvitationRole = 'admin' | 'guest' | 'senior-peer';

  export interface Invitation {
    /** Mirrored from the doc ID for convenience when reading. */
    token: string;
    /** UID of the admin/owner who created the invitation. */
    inviterUid: string;
    houseId: string;
    /** What role the invitee will be granted on redemption. */
    role: InvitationRole;
    /** Email the invitation was sent to; must match request.auth.token.email
     *  on redeem (case-insensitive). */
    invitedEmail: string;
    /** Initial phase name for guest invitations (optional). */
    initialPhase?: string;
    /** ISO 8601. */
    expiresAt: string;
    /** ISO 8601 when created. */
    createdAt: string;
    /** ISO 8601 when redeemed; absent until redemption. */
    redeemedAt?: string;
    /** UID that redeemed the invitation; absent until redemption. */
    redeemedByUid?: string;
  }
  ```

- [ ] **Step 2: Create the token util**

  Write `functions/src/util/tokens.ts`:

  ```ts
  import { randomBytes } from 'crypto';

  /**
   * Returns a 32-byte cryptographically random base64url-encoded string
   * (~43 characters). Suitable as an opaque bearer token whose only
   * security property is being unguessable.
   */
  export function generateInvitationToken(): string {
    return randomBytes(32).toString('base64url');
  }
  ```

- [ ] **Step 3: Add token-util unit test**

  Create `functions/src/util/__tests__/tokens.test.ts`:

  ```ts
  import { generateInvitationToken } from '../tokens';

  describe('generateInvitationToken', () => {
    it('returns a non-empty string', () => {
      const t = generateInvitationToken();
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(20);
    });

    it('is base64url (no +, /, or = padding)', () => {
      const t = generateInvitationToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('never collides across 1000 calls (random — not a hash test)', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const t = generateInvitationToken();
        expect(seen.has(t)).toBe(false);
        seen.add(t);
      }
    });
  });
  ```

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/util/__tests__/tokens.test.ts`
  Expected: 3 tests pass.

- [ ] **Step 4: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/entities/Invitation.ts functions/src/util/tokens.ts functions/src/util/__tests__/tokens.test.ts
  git commit -m "feat(invitations): add Invitation entity + opaque-token util"
  ```

### Task 2: Extract the email-send helper from `sendInviteEmails`

The current `sendInviteEmails` CF body assembles the SendGrid payload + sends the email. We need that same code reusable by `createInvitation`. Extract it into a util without changing `sendInviteEmails`' behavior in this task.

**Files:**

- Create: `functions/src/util/inviteEmails.ts`
- Modify: `functions/src/callable/subscriptions.ts` (call into the util)

- [ ] **Step 1: Read the current `sendInviteEmails` body**

  ```bash
  cd ~/dev/regroup-functions
  sed -n '540,640p' functions/src/callable/subscriptions.ts
  ```

  Identify the block that, given a single invite payload `{ email, dynamicLink, type }`, performs the SendGrid email send. We'll call this the **send-one helper**.

- [ ] **Step 2: Extract the send-one helper**

  Create `functions/src/util/inviteEmails.ts` with the helper signature:

  ```ts
  import { logger } from 'firebase-functions';
  // Reuse whatever SendGrid client + 'from' constant subscriptions.ts uses.
  // Copy those imports here; do NOT re-import sendInviteEmails itself.

  export type InviteEmailType = 'admin' | 'guest' | 'superAdmin' | 'supporter';

  export interface SendOneInviteParams {
    toEmail: string;
    inviteLink: string;
    role: InviteEmailType;
    inviterDisplayName?: string;
  }

  /**
   * Sends a single invitation email via SendGrid. Extracted from
   * sendInviteEmails so it can be reused by createInvitation without
   * recreating the SendGrid plumbing.
   */
  export async function sendOneInviteEmail(
    params: SendOneInviteParams,
  ): Promise<void> {
    // Paste the body of the per-invite send loop from subscriptions.ts:
    //   - build subject/text/html for the role
    //   - call the SendGrid client.send(...)
    //   - logger.info on success; throw on failure
  }
  ```

  Implementation detail: paste the same role→template→SendGrid call the existing `sendInviteEmails` loop uses. Do not change the subject/body templates.

- [ ] **Step 3: Make `sendInviteEmails` use the extracted helper**

  In `functions/src/callable/subscriptions.ts`, replace the inline loop body with a call to `sendOneInviteEmail(...)`. The CF's external signature does not change.

- [ ] **Step 4: Verify existing `sendInviteEmails` tests still pass**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/subscriptions.test.ts`
  Expected: every previously-passing test still passes.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/util/inviteEmails.ts functions/src/callable/subscriptions.ts
  git commit -m "refactor(invitations): extract sendOneInviteEmail helper for reuse"
  ```

### Task 3: `createInvitation` CF (admin/owner-only)

**Files:**

- Create: `functions/src/callable/invitations.ts`
- Modify: `functions/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test for the happy path**

  Create `functions/src/__tests__/callable/invitations.test.ts`:

  ```ts
  // src/__tests__/callable/invitations.test.ts

  jest.mock('firebase-functions/v2/https', () => {
    const actual = jest.requireActual('firebase-functions/v2/https');
    return {
      ...actual,
      onCall: (_opts: any, handler?: Function) =>
        typeof _opts === 'function' ? _opts : handler,
    };
  });

  jest.mock('firebase-functions', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  }));

  // The CF reads houses + writes invitations via admin.firestore().
  const mockHouseGet = jest.fn();
  const mockInvitationsSet = jest.fn();
  const mockInvitationsDocGet = jest.fn();
  const mockInvitationsDocUpdate = jest.fn();

  jest.mock('firebase-admin', () => ({
    auth: jest.fn(() => ({ setCustomUserClaims: jest.fn() })),
    firestore: () => ({
      collection: (name: string) => {
        if (name === 'houses')
          return { doc: (_id: string) => ({ get: mockHouseGet }) };
        if (name === 'invitations')
          return {
            doc: (_id: string) => ({
              get: mockInvitationsDocGet,
              set: mockInvitationsSet,
              update: mockInvitationsDocUpdate,
            }),
          };
        return {};
      },
    }),
  }));

  // Token util — deterministic for testing.
  jest.mock('../../util/tokens', () => ({
    generateInvitationToken: () => 'TEST_TOKEN_FIXED',
  }));

  // Email helper — verify the CF calls it with the right args, don't
  // actually send mail.
  const mockSendOneInviteEmail = jest.fn();
  jest.mock('../../util/inviteEmails', () => ({
    sendOneInviteEmail: (...args: unknown[]) => mockSendOneInviteEmail(...args),
  }));

  import { createInvitation } from '../../callable/invitations';
  import { HttpsError } from 'firebase-functions/v2/https';

  const fakeAuth = { uid: 'inviter-uid', token: { email: 'inviter@x.com' } };
  const call = (fn: unknown, data: unknown, auth: object | null = fakeAuth) =>
    (fn as Function)({ data, auth: auth ?? undefined });

  beforeEach(() => jest.clearAllMocks());

  describe('createInvitation — happy path', () => {
    it('admin of the house writes an invitation doc and returns the token', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({
          ownerId: 'someone-else',
          adminIds: ['inviter-admin-id'],
        }),
      });

      const result = await call(
        createInvitation,
        {
          email: 'newadmin@x.com',
          houseId: 'house-1',
          role: 'admin',
        },
        { uid: 'inviter-uid', token: { admin: { 'house-1': true } } },
      );

      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
      expect(mockInvitationsSet).toHaveBeenCalledTimes(1);
      const [doc] = mockInvitationsSet.mock.calls[0];
      expect(doc).toMatchObject({
        token: 'TEST_TOKEN_FIXED',
        inviterUid: 'inviter-uid',
        houseId: 'house-1',
        role: 'admin',
        invitedEmail: 'newadmin@x.com',
      });
      expect(doc.expiresAt).toEqual(expect.any(String));
      expect(mockSendOneInviteEmail).toHaveBeenCalledTimes(1);
    });
  });
  ```

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/invitations.test.ts`
  Expected: FAIL — `createInvitation` not exported.

- [ ] **Step 2: Implement `createInvitation`**

  Create `functions/src/callable/invitations.ts`:

  ```ts
  import { onCall, HttpsError } from 'firebase-functions/v2/https';
  import { logger } from 'firebase-functions';
  import * as admin from 'firebase-admin';
  import { z } from 'zod';
  import { parseInput } from '../validation';
  import { generateInvitationToken } from '../util/tokens';
  import { sendOneInviteEmail } from '../util/inviteEmails';
  import { Invitation, InvitationRole } from '../entities/Invitation';

  const ROLES: InvitationRole[] = ['admin', 'guest', 'senior-peer'];

  const createInvitationSchema = z.object({
    email: z.string().email(),
    houseId: z.string().min(1),
    role: z.enum(['admin', 'guest', 'senior-peer']),
    initialPhase: z.string().optional(),
  });

  /**
   * Token TTL — 7 days from creation. Matches the prior client-side
   * `expirationDate` value at src/services/native-deep-links.ts:119 so the
   * UX is unchanged.
   */
  const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Build the invitation link the recipient will tap. The mobile parser at
   * src/services/native-deep-links.ts treats `?token=<...>` as the new
   * server-issued format.
   */
  function buildInviteLink(token: string): string {
    return `regroup-app://?type=invitation&token=${encodeURIComponent(token)}`;
  }

  export const createInvitation = onCall(async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }
    const input = parseInput(createInvitationSchema, request.data);

    // ── Authorization: caller must be owner or existing admin/superAdmin ──
    const houseSnap = await admin
      .firestore()
      .collection('houses')
      .doc(input.houseId)
      .get();
    if (!houseSnap.exists) {
      throw new HttpsError('not-found', 'House not found');
    }
    const house = houseSnap.data() as { ownerId?: string };
    const callerUid = request.auth.uid;
    const callerClaims = (request.auth.token ?? {}) as {
      admin?: Record<string, boolean>;
      superAdmin?: Record<string, boolean>;
    };
    const isOwner = house.ownerId === callerUid;
    const isAdmin = callerClaims.admin?.[input.houseId] === true;
    const isSuperAdmin = callerClaims.superAdmin?.[input.houseId] === true;
    if (!isOwner && !isAdmin && !isSuperAdmin) {
      logger.warn('createInvitation: denied', {
        callerUid,
        houseId: input.houseId,
      });
      throw new HttpsError(
        'permission-denied',
        'Only the house owner or an existing admin can send invitations',
      );
    }

    // ── Build + write the invitation doc ─────────────────────────────────
    const token = generateInvitationToken();
    const now = new Date();
    const invitation: Invitation = {
      token,
      inviterUid: callerUid,
      houseId: input.houseId,
      role: input.role,
      invitedEmail: input.email.toLowerCase(),
      initialPhase: input.initialPhase,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    };
    await admin
      .firestore()
      .collection('invitations')
      .doc(token)
      .set(invitation);

    // ── Send the email via the extracted helper ──────────────────────────
    const link = buildInviteLink(token);
    // role string for the email template: 'admin' | 'guest' (senior-peer
    // is templated as 'guest' for the recipient — they see the same email).
    const emailRole = input.role === 'senior-peer' ? 'guest' : input.role;
    await sendOneInviteEmail({
      toEmail: input.email,
      inviteLink: link,
      role: emailRole,
    });

    logger.info('createInvitation: issued', {
      callerUid,
      houseId: input.houseId,
      role: input.role,
    });
    return { token };
  });
  ```

- [ ] **Step 3: Run the happy-path test — expect PASS**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/invitations.test.ts -t "happy path"`
  Expected: PASS.

- [ ] **Step 4: Add the deny-case tests**

  Append to `functions/src/__tests__/callable/invitations.test.ts`:

  ```ts
  describe('createInvitation — denials', () => {
    it('DENY unauthenticated caller', async () => {
      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'h', role: 'admin' },
          null,
        ),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
      expect(mockInvitationsSet).not.toHaveBeenCalled();
    });

    it('DENY caller who is neither owner nor admin/superAdmin of the house', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'house-1', role: 'admin' },
          { uid: 'random-uid', token: { admin: { 'house-OTHER': true } } },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(mockInvitationsSet).not.toHaveBeenCalled();
    });

    it('DENY house that does not exist', async () => {
      mockHouseGet.mockResolvedValue({ exists: false });
      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'ghost', role: 'admin' },
          fakeAuth,
        ),
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('REJECT invalid role at schema boundary', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'inviter-uid' }),
      });
      await expect(
        call(
          createInvitation,
          { email: 'x@x.com', houseId: 'h', role: 'superAdmin' as any },
          fakeAuth,
        ),
      ).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('ALLOW owner (token admin claim absent) — owner is the setup-wizard self-service path', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      const result = await call(
        createInvitation,
        { email: 'x@x.com', houseId: 'h', role: 'admin' },
        { uid: 'owner-uid', token: {} }, // no admin claim yet
      );
      expect(result).toEqual({ token: 'TEST_TOKEN_FIXED' });
    });
  });
  ```

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/invitations.test.ts`
  Expected: all 6 tests in the file pass.

- [ ] **Step 5: Re-export from `index.ts`**

  Add to `functions/src/index.ts`:

  ```ts
  export { createInvitation } from './callable/invitations';
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/callable/invitations.ts functions/src/__tests__/callable/invitations.test.ts functions/src/index.ts
  git commit -m "feat(invitations): add createInvitation callable (owner/admin only)"
  ```

### Task 4: `peekInvitation` CF (returns metadata for signup-form pre-fill)

**Files:**

- Modify: `functions/src/callable/invitations.ts`
- Modify: `functions/src/__tests__/callable/invitations.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add failing tests**

  Append to `functions/src/__tests__/callable/invitations.test.ts`:

  ```ts
  describe('peekInvitation', () => {
    it('returns role/email/houseId/initialPhase for a valid token', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          token: 'TEST_TOKEN_FIXED',
          inviterUid: 'inviter-uid',
          houseId: 'house-1',
          role: 'guest',
          invitedEmail: 'guest@x.com',
          initialPhase: 'Phase 1',
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });

      const { peekInvitation } = require('../../callable/invitations');
      const result = await call(
        peekInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        null, // peek is unauthenticated — the token IS the credential
      );
      expect(result).toEqual({
        houseId: 'house-1',
        role: 'guest',
        invitedEmail: 'guest@x.com',
        initialPhase: 'Phase 1',
        expiresAt: expect.any(String),
      });
    });

    it('DENY: token does not exist (404 with generic message)', async () => {
      mockInvitationsDocGet.mockResolvedValue({ exists: false });
      const { peekInvitation } = require('../../callable/invitations');
      await expect(
        call(peekInvitation, { token: 'MISSING' }, null),
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('DENY: token already redeemed', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          token: 'T',
          inviterUid: 'i',
          houseId: 'h',
          role: 'guest',
          invitedEmail: 'x@x.com',
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          createdAt: new Date().toISOString(),
          redeemedAt: new Date().toISOString(),
          redeemedByUid: 'someone',
        }),
      });
      const { peekInvitation } = require('../../callable/invitations');
      await expect(
        call(peekInvitation, { token: 'T' }, null),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('DENY: token expired', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          token: 'T',
          inviterUid: 'i',
          houseId: 'h',
          role: 'guest',
          invitedEmail: 'x@x.com',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      });
      const { peekInvitation } = require('../../callable/invitations');
      await expect(
        call(peekInvitation, { token: 'T' }, null),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });
  });
  ```

- [ ] **Step 2: Implement `peekInvitation`**

  Append to `functions/src/callable/invitations.ts`:

  ```ts
  const peekInvitationSchema = z.object({ token: z.string().min(1) });

  /**
   * Returns the metadata needed by SignUpForm to pre-fill the email and
   * branch on role. The token is the credential (anyone with it can call).
   * We still reject expired / redeemed tokens here so the UI can show the
   * correct error state before the user finishes signup.
   */
  export const peekInvitation = onCall(async request => {
    const { token } = parseInput(peekInvitationSchema, request.data);
    const snap = await admin
      .firestore()
      .collection('invitations')
      .doc(token)
      .get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invitation not found');
    }
    const inv = snap.data() as Invitation;
    if (inv.redeemedAt) {
      throw new HttpsError(
        'failed-precondition',
        'Invitation already redeemed',
      );
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }
    return {
      houseId: inv.houseId,
      role: inv.role,
      invitedEmail: inv.invitedEmail,
      initialPhase: inv.initialPhase,
      expiresAt: inv.expiresAt,
    };
  });
  ```

- [ ] **Step 3: Run the tests**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/invitations.test.ts -t "peekInvitation"`
  Expected: 4 tests pass.

- [ ] **Step 4: Re-export from `index.ts`**

  Add `peekInvitation` to the index export.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/callable/invitations.ts functions/src/__tests__/callable/invitations.test.ts functions/src/index.ts
  git commit -m "feat(invitations): add peekInvitation callable"
  ```

### Task 5: `redeemInvitation` CF (the gate)

**Files:**

- Modify: `functions/src/callable/invitations.ts`
- Modify: `functions/src/__tests__/callable/invitations.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Add failing tests**

  Append to the test file:

  ```ts
  describe('redeemInvitation', () => {
    const VALID = {
      token: 'TEST_TOKEN_FIXED',
      inviterUid: 'inviter-uid',
      houseId: 'house-1',
      role: 'admin' as const,
      invitedEmail: 'alice@x.com',
      expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    it('happy path: sets claims from the invitation doc and marks redeemed', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID }),
      });
      mockCreateClaims.mockResolvedValue({ admin: ['house-1'] });
      mockSetCustomUserClaims.mockResolvedValue(undefined);

      const { redeemInvitation } = require('../../callable/invitations');
      const result = await call(
        redeemInvitation,
        { token: 'TEST_TOKEN_FIXED' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      );

      expect(mockCreateClaims).toHaveBeenCalledWith(
        'alice-uid',
        ['house-1'],
        'admin',
        false,
      );
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith(
        'alice-uid',
        expect.objectContaining({ admin: ['house-1'] }),
      );
      expect(mockInvitationsDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          redeemedAt: expect.any(String),
          redeemedByUid: 'alice-uid',
        }),
      );
      expect(result).toEqual({ houseId: 'house-1', role: 'admin' });
    });

    it('DENY: caller email does not match invitation email (case-insensitive)', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID }),
      });
      const { redeemInvitation } = require('../../callable/invitations');
      await expect(
        call(
          redeemInvitation,
          { token: 'TEST_TOKEN_FIXED' },
          { uid: 'attacker-uid', token: { email: 'attacker@x.com' } },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(mockInvitationsDocUpdate).not.toHaveBeenCalled();
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    });

    it('DENY: already redeemed', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          ...VALID,
          redeemedAt: new Date().toISOString(),
          redeemedByUid: 'someone-else',
        }),
      });
      const { redeemInvitation } = require('../../callable/invitations');
      await expect(
        call(
          redeemInvitation,
          { token: 'TEST_TOKEN_FIXED' },
          { uid: 'alice-uid', token: { email: 'alice@x.com' } },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('DENY: expired', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          ...VALID,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }),
      });
      const { redeemInvitation } = require('../../callable/invitations');
      await expect(
        call(
          redeemInvitation,
          { token: 'TEST_TOKEN_FIXED' },
          { uid: 'alice-uid', token: { email: 'alice@x.com' } },
        ),
      ).rejects.toMatchObject({ code: 'failed-precondition' });
    });

    it('DENY: unauthenticated', async () => {
      const { redeemInvitation } = require('../../callable/invitations');
      await expect(
        call(redeemInvitation, { token: 'T' }, null),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
    });

    it('DENY: token not found', async () => {
      mockInvitationsDocGet.mockResolvedValue({ exists: false });
      const { redeemInvitation } = require('../../callable/invitations');
      await expect(
        call(
          redeemInvitation,
          { token: 'GHOST' },
          { uid: 'alice-uid', token: { email: 'alice@x.com' } },
        ),
      ).rejects.toMatchObject({ code: 'not-found' });
    });

    it('role=guest maps to a guest claim (not admin)', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID, role: 'guest' }),
      });
      mockCreateClaims.mockResolvedValue({ guest: ['house-1'] });
      const { redeemInvitation } = require('../../callable/invitations');
      await call(
        redeemInvitation,
        { token: 'T' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      );
      expect(mockCreateClaims).toHaveBeenCalledWith(
        'alice-uid',
        ['house-1'],
        'guest',
        false,
      );
    });

    it('role=senior-peer maps to BOTH guest and admin claims', async () => {
      mockInvitationsDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...VALID, role: 'senior-peer' }),
      });
      mockCreateClaims.mockResolvedValue({ guest: ['house-1'] });
      const { redeemInvitation } = require('../../callable/invitations');
      await call(
        redeemInvitation,
        { token: 'T' },
        { uid: 'alice-uid', token: { email: 'alice@x.com' } },
      );
      expect(mockCreateClaims).toHaveBeenCalledTimes(2);
      expect(mockCreateClaims).toHaveBeenNthCalledWith(
        1,
        'alice-uid',
        ['house-1'],
        'guest',
        false,
      );
      expect(mockCreateClaims).toHaveBeenNthCalledWith(
        2,
        'alice-uid',
        ['house-1'],
        'admin',
        false,
      );
    });
  });
  ```

  Add the `mockCreateClaims` import to the existing mocks block at the top of the file (it's already there for the existing `auth.test.ts` but this is a fresh file — wire it in).

  Run the suite:

  ```bash
  cd ~/dev/regroup-functions/functions
  npx jest src/__tests__/callable/invitations.test.ts -t "redeemInvitation"
  ```

  Expected: all 8 tests fail with `redeemInvitation is not a function`.

- [ ] **Step 2: Implement `redeemInvitation`**

  Append to `functions/src/callable/invitations.ts`:

  ```ts
  import { createClaims } from '../util/claims';
  import { auth as adminAuth } from 'firebase-admin';

  const redeemInvitationSchema = z.object({ token: z.string().min(1) });

  export const redeemInvitation = onCall(async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }
    const { token } = parseInput(redeemInvitationSchema, request.data);
    const callerUid = request.auth.uid;
    const callerEmail = (request.auth.token?.email ?? '').toLowerCase();

    const ref = admin.firestore().collection('invitations').doc(token);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invitation not found');
    }
    const inv = snap.data() as Invitation;

    if (inv.redeemedAt) {
      throw new HttpsError(
        'failed-precondition',
        'Invitation already redeemed',
      );
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new HttpsError('failed-precondition', 'Invitation has expired');
    }
    if (inv.invitedEmail.toLowerCase() !== callerEmail) {
      logger.warn('redeemInvitation: email mismatch', {
        callerUid,
        invitedEmail: inv.invitedEmail,
        callerEmail,
      });
      throw new HttpsError(
        'permission-denied',
        'Invitation was issued to a different email address',
      );
    }

    // Map role → claims. createClaims is the canonical merger; we call it
    // once for guest+senior-peer and a second time to layer admin on top
    // of senior-peer.
    if (inv.role === 'guest' || inv.role === 'senior-peer') {
      const claims = await createClaims(
        callerUid,
        [inv.houseId],
        'guest',
        false,
      );
      await adminAuth().setCustomUserClaims(callerUid, claims);
    }
    if (inv.role === 'admin' || inv.role === 'senior-peer') {
      const claims = await createClaims(
        callerUid,
        [inv.houseId],
        'admin',
        false,
      );
      await adminAuth().setCustomUserClaims(callerUid, claims);
    }

    await ref.update({
      redeemedAt: new Date().toISOString(),
      redeemedByUid: callerUid,
    });

    logger.info('redeemInvitation: success', {
      callerUid,
      houseId: inv.houseId,
      role: inv.role,
    });
    return { houseId: inv.houseId, role: inv.role };
  });
  ```

- [ ] **Step 3: Run the redeem tests**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/invitations.test.ts -t "redeemInvitation"`
  Expected: all 8 tests pass.

- [ ] **Step 4: Run the full functions test suite**

  Run: `cd ~/dev/regroup-functions/functions && npx jest`
  Expected: no regressions in existing CFs.

- [ ] **Step 5: Re-export from `index.ts`**

  Add `redeemInvitation` to the index export.

- [ ] **Step 6: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/callable/invitations.ts functions/src/__tests__/callable/invitations.test.ts functions/src/index.ts
  git commit -m "feat(invitations): add redeemInvitation callable — server-issued claim grants"
  ```

---

## Phase B: Firestore rules for `invitations/{token}`

The new collection must be writable only by the server (CFs using the admin SDK bypass rules). Clients have **no** read/write access — peek/redeem go through CFs.

**Files:**

- Modify: `firebase/firestore.rules`
- Modify: `firebase/__tests__/firestore.rules.test.ts`

### Task 6: Add the rules + deny tests

- [ ] **Step 1: Add the rules block**

  In `firebase/firestore.rules`, anywhere in the top-level `match /databases/{database}/documents` body, add:

  ```
  match /invitations/{token} {
    // All access goes through createInvitation / peekInvitation /
    // redeemInvitation callables. The admin SDK bypasses rules, so
    // clients are denied entirely.
    allow read, write: if false;
  }
  ```

- [ ] **Step 2: Add deny tests**

  Append to `firebase/__tests__/firestore.rules.test.ts`:

  ```ts
  describe('invitations/{token} — all client access denied (server-only)', () => {
    const TOKEN = 'test-token-abc';

    test('DENY unauthenticated client read', async () => {
      const ctx = testEnv.unauthenticatedContext();
      await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
    });

    test('DENY unauthenticated client write', async () => {
      const ctx = testEnv.unauthenticatedContext();
      await assertFails(
        setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), { x: 1 }),
      );
    });

    test('DENY signed-in user read', async () => {
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authUserOnly(OTHER_UID),
      );
      await assertFails(getDoc(doc(ctx.firestore(), `invitations/${TOKEN}`)));
    });

    test('DENY admin of any house writing an invitation directly', async () => {
      const ctx = testEnv.authenticatedContext(
        ADMIN_UID,
        authHouseAdmin(ADMIN_UID, HOUSE_ID),
      );
      await assertFails(
        setDoc(doc(ctx.firestore(), `invitations/${TOKEN}`), {
          token: TOKEN,
          inviterUid: ADMIN_UID,
          houseId: HOUSE_ID,
          role: 'admin',
          invitedEmail: 'x@x.com',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: new Date().toISOString(),
        }),
      );
    });

    test('DENY redemption-via-client write (anyone trying to set redeemedAt)', async () => {
      // Even if the doc existed somehow, a client cannot mark it redeemed.
      const ctx = testEnv.authenticatedContext(
        OTHER_UID,
        authUserOnly(OTHER_UID),
      );
      await assertFails(
        setDoc(
          doc(ctx.firestore(), `invitations/${TOKEN}`),
          { redeemedAt: new Date().toISOString(), redeemedByUid: OTHER_UID },
          { merge: true },
        ),
      );
    });
  });
  ```

- [ ] **Step 3: Verify**

  If Java + Firebase emulator are available locally:

  ```bash
  cd /Users/marcuspersonal/dev/Regroup/firebase
  firebase emulators:exec --only firestore,storage --project demo-test "cd .. && npm run test:rules"
  ```

  Expected: all 5 new `invitations` tests pass + no regressions in the existing suites.

  If not available locally: the `unit-tests.yml` workflow runs `npm run test:rules` in CI on every PR — these will execute there.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add firebase/firestore.rules firebase/__tests__/firestore.rules.test.ts
  git commit -m "feat(rules): deny client access to invitations/{token} (server-only)"
  ```

---

## Phase C: Mobile peek + redeem with backward-compat fallback

This phase lets the mobile app handle BOTH the new `?token=` deep links and the legacy URL-payload deep links. Users with old, unredeemed links still complete signup; users with new server-issued links go through the secure path.

**Files:**

- Modify: `src/services/native-deep-links.ts`
- Create: `src/services/invitations.ts`
- Modify: `src/screens/SignUp/SignUpForm.tsx`
- Modify: `src/entities/Invite.tsx` (add an optional `token` field)

### Task 7: Add `token` to the Invitation entity and parse it from deep links

- [ ] **Step 1: Add `token` to the entity**

  In `src/entities/Invite.tsx`:

  ```ts
  export interface Invitation extends BaseEntity {
    type: InvitationType;
    houseId: string;
    inviterId: string;
    email: string;
    initialPhase: string;
    expirationDate: Date;
    ownerId: string;
    /**
     * Server-issued opaque token. Present on new invitations created via
     * the createInvitation CF; absent on legacy URL-payload links.
     * When present, signup uses redeemInvitation instead of
     * addAdminAuthorization/addGuestAuthorization.
     */
    token?: string;
  }
  ```

- [ ] **Step 2: Failing test for the parser**

  Find or create `src/services/__tests__/native-deep-links.test.ts`. Add:

  ```ts
  import { createInvitationFromLink } from '../native-deep-links';

  describe('createInvitationFromLink — token deep links', () => {
    it('extracts token from a new-format link', () => {
      const inv = createInvitationFromLink({
        url: 'regroup-app://?type=invitation&token=abc.123_xyz-456',
      });
      expect(inv.token).toBe('abc.123_xyz-456');
      // Legacy fields are empty — the server fills them via peekInvitation.
      expect(inv.houseId).toBe('');
      expect(inv.email).toBe('');
    });

    it('still parses a legacy URL-payload link (backward compat)', () => {
      const inv = createInvitationFromLink({
        url: 'regroup-app://?type=invitation&invitationType=admin&house=h1&inviter=u1&email=a@x.com&owner=o1',
      });
      expect(inv.token).toBeUndefined();
      expect(inv.houseId).toBe('h1');
      expect(inv.email).toBe('a@x.com');
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/services/__tests__/native-deep-links.test.ts`
  Expected: FAIL — parser doesn't return `token` yet.

- [ ] **Step 3: Update the parser**

  In `src/services/native-deep-links.ts`, replace the body of `createInvitationFromLink` with:

  ```ts
  export const createInvitationFromLink = (
    link: NativeDeepLink,
  ): Invitation => {
    try {
      const parsedUrl = new URL(link.url);
      const query: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      if (query.type !== 'invitation') {
        throw new Error('Invalid deep link: not an invitation link');
      }

      // New format: opaque token only. SignUpForm calls peekInvitation +
      // redeemInvitation to fill in metadata + grant claims.
      if (query.token) {
        return {
          id: '',
          type: 'guest', // placeholder — overwritten by peekInvitation
          houseId: '',
          inviterId: '',
          ownerId: '',
          email: '',
          initialPhase: '',
          expirationDate: new Date(
            new Date().getTime() + 7 * 24 * 60 * 60 * 1000,
          ),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          token: query.token,
        };
      }

      // Legacy format — kept until Phase F removes it.
      if (!query.house || !query.email) {
        logException(
          new Error('createInvitationFromLink — missing required parameters'),
        );
        throw new Error('Invalid deep link: missing required parameters');
      }

      const invitation: Invitation = {
        id: '',
        type: query.invitationType as InvitationType,
        houseId: query.house as string,
        inviterId: (query.inviter as string) || '',
        ownerId: (query.owner as string) || '',
        email: query.email as string,
        initialPhase: query.initialPhase
          ? (query.initialPhase as string).replace(/\+/g, ' ')
          : '',
        expirationDate: new Date(
          new Date().getTime() + 7 * 24 * 60 * 60 * 1000,
        ),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return invitation;
    } catch (error) {
      logException(error);
      throw new Error('Failed to parse invitation link');
    }
  };
  ```

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/services/__tests__/native-deep-links.test.ts`
  Expected: PASS for both tests.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add src/entities/Invite.tsx src/services/native-deep-links.ts src/services/__tests__/native-deep-links.test.ts
  git commit -m "feat(invitations): parse token from new deep-link format (backward compat)"
  ```

### Task 8: Add mobile service wrappers for the new CFs

**Files:**

- Create: `src/services/invitations.ts`

- [ ] **Step 1: Write the failing test**

  Create `src/services/__tests__/invitations.test.ts`:

  ```ts
  jest.mock('../../../firebase-setup', () => ({
    functions: {
      httpsCallable: jest.fn(),
    },
  }));

  import {
    createInvitation,
    peekInvitation,
    redeemInvitation,
  } from '../invitations';
  import { functions } from '../../../firebase-setup';

  beforeEach(() => jest.clearAllMocks());

  describe('invitations service', () => {
    it('createInvitation passes the payload to the CF and returns the token', async () => {
      const mockCall = jest.fn().mockResolvedValue({
        data: { token: 'TOK-1' },
      });
      (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

      const result = await createInvitation({
        email: 'x@x.com',
        houseId: 'h',
        role: 'admin',
      });
      expect(functions.httpsCallable).toHaveBeenCalledWith('createInvitation');
      expect(mockCall).toHaveBeenCalledWith({
        email: 'x@x.com',
        houseId: 'h',
        role: 'admin',
      });
      expect(result).toEqual({ token: 'TOK-1' });
    });

    it('peekInvitation passes the token and returns metadata', async () => {
      const mockCall = jest.fn().mockResolvedValue({
        data: {
          houseId: 'h',
          role: 'guest',
          invitedEmail: 'x@x.com',
          initialPhase: 'Phase 1',
        },
      });
      (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

      const result = await peekInvitation('TOK-1');
      expect(mockCall).toHaveBeenCalledWith({ token: 'TOK-1' });
      expect(result.role).toBe('guest');
    });

    it('redeemInvitation passes the token', async () => {
      const mockCall = jest.fn().mockResolvedValue({
        data: { houseId: 'h', role: 'admin' },
      });
      (functions.httpsCallable as jest.Mock).mockReturnValue(mockCall);

      const result = await redeemInvitation('TOK-1');
      expect(mockCall).toHaveBeenCalledWith({ token: 'TOK-1' });
      expect(result).toEqual({ houseId: 'h', role: 'admin' });
    });
  });
  ```

- [ ] **Step 2: Implement the service**

  Create `src/services/invitations.ts`:

  ```ts
  import { functions } from '../../firebase-setup';

  export type InvitationRole = 'admin' | 'guest' | 'senior-peer';

  export interface CreateInvitationInput {
    email: string;
    houseId: string;
    role: InvitationRole;
    initialPhase?: string;
  }

  export interface CreateInvitationResult {
    token: string;
  }

  export interface PeekInvitationResult {
    houseId: string;
    role: InvitationRole;
    invitedEmail: string;
    initialPhase?: string;
    expiresAt: string;
  }

  export interface RedeemInvitationResult {
    houseId: string;
    role: InvitationRole;
  }

  /**
   * Ask the server to issue an invitation token + send the email. The caller
   * must be the house owner or an existing admin/superAdmin of the target
   * house (enforced by the CF).
   */
  export async function createInvitation(
    input: CreateInvitationInput,
  ): Promise<CreateInvitationResult> {
    const result = await functions.httpsCallable('createInvitation')(
      input as any,
    );
    return result.data as CreateInvitationResult;
  }

  /**
   * Fetch metadata for an unredeemed invitation token. Used by SignUpForm
   * to pre-fill the email and branch on role before the user signs up.
   * Anyone with the token can call (the token IS the credential).
   */
  export async function peekInvitation(
    token: string,
  ): Promise<PeekInvitationResult> {
    const result = await functions.httpsCallable('peekInvitation')({
      token,
    } as any);
    return result.data as PeekInvitationResult;
  }

  /**
   * Redeem an invitation token after sign-up. The CF validates the caller's
   * email matches the invitation and sets the role-appropriate custom
   * claim. Tokens are single-use.
   */
  export async function redeemInvitation(
    token: string,
  ): Promise<RedeemInvitationResult> {
    const result = await functions.httpsCallable('redeemInvitation')({
      token,
    } as any);
    return result.data as RedeemInvitationResult;
  }
  ```

- [ ] **Step 3: Run the tests**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npx jest src/services/__tests__/invitations.test.ts`
  Expected: 3 tests pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add src/services/invitations.ts src/services/__tests__/invitations.test.ts
  git commit -m "feat(invitations): add mobile service wrappers for create/peek/redeem"
  ```

### Task 9: Wire `SignUpForm` to use `redeemInvitation` when invitation has a token

**Files:**

- Modify: `src/screens/SignUp/SignUpForm.tsx`

Layout of the change:

- BEFORE `createUser`: if invitation has `token`, call `peekInvitation(token)` and use the returned `role` + `invitedEmail` to drive form state (overwrites the placeholder values the parser produced).
- AFTER `createUser` succeeds: if invitation has `token`, call `redeemInvitation(token)`. Skip the legacy `addAdminAuthorization` / `addGuestAuthorization` calls — those happen only on the legacy branch.
- The legacy branch (no token on the invitation) stays exactly as-is until Phase F.

- [ ] **Step 1: Pre-fill from `peekInvitation` when token present**

  In `SignUpForm.tsx`, find the `mapPropsToValues` block (around line 75). Add a `useEffect` in the parent component (or in `SignUpFormView` — wherever invitation is first consumed) that calls `peekInvitation(invitation.token)` and updates the form's email + the invitation's `houseId`/`type`/`initialPhase` in-place if successful. Render a loading state while the peek is in flight.

  This is the most invasive change in the plan. Read the surrounding 30-line context first; the exact lines depend on how the parent passes invitation down.

  Pseudo-diff:

  ```tsx
  // In the component that owns `invitation` state (above SignUpForm wrapper):
  useEffect(() => {
    if (invitation?.token && !invitation.email) {
      (async () => {
        try {
          const meta = await peekInvitation(invitation.token!);
          setInvitation(prev => ({
            ...prev!,
            email: meta.invitedEmail,
            houseId: meta.houseId,
            type: meta.role,
            initialPhase: meta.initialPhase ?? '',
          }));
        } catch (err) {
          logException(err);
          setError(
            'This invitation link is no longer valid. Ask your house admin to resend it.',
          );
        }
      })();
    }
  }, [invitation?.token]);
  ```

- [ ] **Step 2: Replace claim grant with redeem when token present**

  Find the block at `src/screens/SignUp/SignUpForm.tsx:166-225` (admin branch) and the parallel guest branch at `:118-160`. For each branch:

  - When `invitation.token` is set: call `redeemInvitation(invitation.token)` after `createUser`. The redeemInvitation CF sets the claims; skip `addAdminAuthorization`/`addGuestAuthorization`.
  - When `invitation.token` is NOT set: legacy path, no change.

  Concrete admin-branch shape:

  ```ts
  if (invitation && invitation.type === 'admin') {
    // ... build mappedAdmin / newAdmin ...
    try {
      if (invitation.token) {
        await redeemInvitation(invitation.token);
      } else {
        await addAdminAuthorization(newAdmin);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getAuthUser(true);
    } catch (error: any) {
      // ... existing error handling ...
    }
    // ... existing createAdmin + updateUser block ...
  }
  ```

  Same pattern for `invitation.type === "guest"` / `"senior-peer"`.

- [ ] **Step 3: Add tests for both branches**

  In the existing SignUpForm test file (`src/screens/SignUp/__tests__/SignUpForm.test.tsx` if it exists, or create one), add a test asserting that:

  - When `invitation.token` is present, `redeemInvitation` is called and `addAdminAuthorization` is NOT.
  - When `invitation.token` is absent, the legacy path runs.

  Skip if no SignUpForm test infra exists — there's a reasonable bound on test scope here; the CF tests cover the security property, the mobile wrapper test covers the call shape.

- [ ] **Step 4: Run the test suite**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npm test -- --no-coverage`
  Expected: existing 4699 tests still pass; 3 new invitations-service tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add src/screens/SignUp/SignUpForm.tsx src/screens/SignUp/__tests__
  git commit -m "feat(invitations): SignUpForm uses redeemInvitation when token present"
  ```

---

## Phase D: Migrate the inviter side to `createInvitation`

Now that mobile can handle both formats, switch the inviter side to issue ONLY tokens. All future invitations are token-based.

**Files:**

- Modify: `src/services/setup-wizard.ts:43-148`
- Modify: `src/services/admin.tsx:60`
- Modify: `src/services/invites.ts:5`

### Task 10: `sendAllInvites` → batch of `createInvitation` calls

- [ ] **Step 1: Replace the body of `sendAllInvites`**

  In `src/services/setup-wizard.ts`, find `sendAllInvites` (line ~43). Replace the body so it calls `createInvitation` once per recipient instead of constructing `createNewInviteLink` URLs and calling `sendInviteEmails`. The new CF assembles the link + sends the email.

  Pseudo-diff:

  ```ts
  import { createInvitation } from './invitations';

  export async function sendAllInvites(
    houses: Houses,
    operator: User,
    guest: boolean = true,
    admin: boolean = true,
    seniorPeer: boolean = true,
  ) {
    const calls: Promise<unknown>[] = [];
    each(houses, house => {
      const initialPhase = getInitialPhase(house);
      if (house.pendingAdminInvites && admin) {
        house.pendingAdminInvites.forEach(email => {
          calls.push(
            createInvitation({
              email,
              houseId: house.id,
              role: 'admin',
              initialPhase: initialPhase?.name,
            }),
          );
        });
      }
      if (house.pendingGuestInvites && guest) {
        house.pendingGuestInvites.forEach(email => {
          calls.push(
            createInvitation({
              email,
              houseId: house.id,
              role: 'guest',
              initialPhase: initialPhase?.name,
            }),
          );
        });
      }
      if (house.seniorPeerEmails && seniorPeer) {
        house.seniorPeerEmails.forEach(email => {
          calls.push(
            createInvitation({
              email,
              houseId: house.id,
              role: 'senior-peer',
              initialPhase: initialPhase?.name,
            }),
          );
        });
      }
    });
    return Promise.all(calls);
  }
  ```

  Remove the unused `InviteEmailPayload`, `createNewInviteLink`, and `sendInvites` imports from this file.

- [ ] **Step 2: Update `createAdminInvite` / `createGuestInvite` to use the new path**

  Both helpers in `setup-wizard.ts` should now call `createInvitation` directly. If they're only consumed within `sendAllInvites`, you can delete them. Check first:

  ```bash
  grep -rn "createAdminInvite\|createGuestInvite" /Users/marcuspersonal/dev/Regroup/src --include='*.ts' --include='*.tsx' | grep -v setup-wizard | grep -v __tests__
  ```

  If no external callers → delete them. If external callers exist → migrate them too.

- [ ] **Step 3: Update `services/admin.tsx:60` and `services/invites.ts:5`**

  Look at both call sites:

  ```bash
  sed -n '55,75p' /Users/marcuspersonal/dev/Regroup/src/services/admin.tsx
  sed -n '1,30p' /Users/marcuspersonal/dev/Regroup/src/services/invites.ts
  ```

  Replace each `functions.httpsCallable('sendInviteEmails')(payload)` with one or more `createInvitation({ email, houseId, role })` calls. The payload shape differs — read the call sites carefully.

- [ ] **Step 4: Run mobile tests**

  Run: `cd /Users/marcuspersonal/dev/Regroup && npm test -- --no-coverage`
  Expected: pass.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  git add src/services/setup-wizard.ts src/services/admin.tsx src/services/invites.ts
  git commit -m "feat(invitations): inviter side issues server tokens via createInvitation"
  ```

---

## Phase E: Harden `addAdminAuthorization` + `addGuestAuthorization`

Now that the signup flow uses `redeemInvitation`, the legacy CFs no longer need to support the "new user self-grants on signup" use case. Restrict them to:

- **Owner self-service:** caller owns every house they're trying to grant claim in (covers `setup-wizard.ts:198` legitimate self-grant of houses the operator just created).
- **Existing-admin delegation:** caller is already admin of the house AND is granting to a different user (peer-to-peer admin promotion from inside the app).

Any other call is denied.

**Files:**

- Modify: `~/dev/regroup-functions/functions/src/callable/auth.ts`
- Modify: `~/dev/regroup-functions/functions/src/__tests__/callable/auth.test.ts`

### Task 11: Harden `addAdminAuthorization`

- [ ] **Step 1: Add failing deny-case tests**

  In `auth.test.ts`, append:

  ```ts
  describe('addAdminAuthorization — authorization guard (post-S2)', () => {
    const mockHouseGet = jest.fn();
    beforeEach(() => {
      jest.clearAllMocks();
      // Wire admin.firestore() through a per-test mock so the guard's
      // owner check can be exercised.
      (require('firebase-admin').firestore as jest.Mock) = jest.fn(() => ({
        collection: () => ({ doc: () => ({ get: mockHouseGet }) }),
      }));
    });

    it("DENY caller granting themselves admin of a house they don't own", async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          addAdminAuthorization,
          {
            userId: 'attacker-uid',
            houseIds: ['house-victim'],
            superAdmin: [],
          },
          { uid: 'attacker-uid', token: {} },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
    });

    it("DENY caller granting another user admin of a house the caller doesn't admin", async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          addAdminAuthorization,
          { userId: 'target-uid', houseIds: ['house-victim'], superAdmin: [] },
          { uid: 'attacker-uid', token: {} },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('ALLOW owner granting themselves admin of their own house (setup-wizard)', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockCreateClaims.mockResolvedValue({});
      mockSetCustomUserClaims.mockResolvedValue(undefined);
      const result = await call(
        addAdminAuthorization,
        { userId: 'owner-uid', houseIds: ['house-1'], superAdmin: [] },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toBe(true);
    });

    it('ALLOW existing admin granting another user admin (delegation)', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      mockCreateClaims.mockResolvedValue({});
      mockSetCustomUserClaims.mockResolvedValue(undefined);
      const result = await call(
        addAdminAuthorization,
        { userId: 'newadmin-uid', houseIds: ['house-1'], superAdmin: [] },
        { uid: 'existing-admin-uid', token: { admin: { 'house-1': true } } },
      );
      expect(result).toBe(true);
    });

    it('DENY existing admin self-granting admin of the SAME house (no-op attempt)', async () => {
      // The guard requires isOwner OR (existingAdmin AND admin.userId !== callerUid).
      // Self-grants of houses you already admin are denied — there's no
      // legitimate use case, and the surface should be minimal.
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          addAdminAuthorization,
          {
            userId: 'existing-admin-uid',
            houseIds: ['house-1'],
            superAdmin: [],
          },
          { uid: 'existing-admin-uid', token: { admin: { 'house-1': true } } },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });
  ```

- [ ] **Step 2: Implement the guard**

  In `functions/src/callable/auth.ts`, replace the body of `addAdminAuthorization` with the version from `.full-review/03-s2-cross-repo-audit.md` Step 1 (the `permission-denied` guard on owner-or-delegating-admin).

  Concretely, add before the existing `createClaims`/`setCustomUserClaims` block:

  ```ts
  import * as admin from 'firebase-admin';
  // ... existing imports ...

  // Inside addAdminAuthorization, after parseInput:
  const callerUid = request.auth.uid;
  const requestedHouses = [
    ...new Set([
      ...(adminInput.houseIds || []),
      ...(adminInput.superAdmin || []),
    ]),
  ];

  if (requestedHouses.length > 0) {
    const houseSnaps = await Promise.all(
      requestedHouses.map(id =>
        admin.firestore().collection('houses').doc(id).get(),
      ),
    );
    for (let i = 0; i < requestedHouses.length; i++) {
      const houseId = requestedHouses[i];
      const snap = houseSnaps[i];
      if (!snap.exists) {
        throw new HttpsError('not-found', `House ${houseId} not found`);
      }
      const house = snap.data() as { ownerId?: string };
      const callerToken = request.auth.token as any;
      const isOwner = house.ownerId === callerUid;
      const callerIsExistingAdmin =
        callerToken?.admin?.[houseId] === true ||
        callerToken?.superAdmin?.[houseId] === true;
      const isDelegation = adminInput.userId !== callerUid;
      const allowed = isOwner || (callerIsExistingAdmin && isDelegation);
      if (!allowed) {
        logger.warn('addAdminAuthorization: denied', {
          callerUid,
          targetUid: adminInput.userId,
          houseId,
        });
        throw new HttpsError(
          'permission-denied',
          'Not authorized to grant admin for this house',
        );
      }
    }
  }
  ```

- [ ] **Step 3: Run the tests**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/auth.test.ts`
  Expected: all existing tests + 5 new deny/allow cases pass.

- [ ] **Step 4: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/callable/auth.ts functions/src/__tests__/callable/auth.test.ts
  git commit -m "security(auth): gate addAdminAuthorization to owner OR delegating admin"
  ```

### Task 12: Harden `addGuestAuthorization`

Same shape as Task 11. Guest authorization needs the same guard: caller must be owner or admin of the house, and not self-granting (guests should sign up via `redeemInvitation` like admins do).

- [ ] **Step 1: Add deny tests**

  Append to `auth.test.ts`:

  ```ts
  describe('addGuestAuthorization — authorization guard (post-S2)', () => {
    const mockHouseGet = jest.fn();
    beforeEach(() => {
      jest.clearAllMocks();
      (require('firebase-admin').firestore as jest.Mock) = jest.fn(() => ({
        collection: () => ({ doc: () => ({ get: mockHouseGet }) }),
      }));
    });

    it('DENY caller granting themselves guest of a house', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          addGuestAuthorization,
          { userId: 'attacker-uid', houseId: 'house-victim', isAdmin: false },
          { uid: 'attacker-uid', token: {} },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('ALLOW owner of the house granting a new guest', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      });
      mockCreateClaims.mockResolvedValue({});
      const result = await call(
        addGuestAuthorization,
        { userId: 'newguest-uid', houseId: 'house-1', isAdmin: false },
        { uid: 'owner-uid', token: {} },
      );
      expect(result).toBe(true);
    });

    it('ALLOW existing admin of the house granting a new guest', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      mockCreateClaims.mockResolvedValue({});
      const result = await call(
        addGuestAuthorization,
        { userId: 'newguest-uid', houseId: 'house-1', isAdmin: false },
        { uid: 'admin-uid', token: { admin: { 'house-1': true } } },
      );
      expect(result).toBe(true);
    });

    it('DENY admin of a DIFFERENT house granting a guest', async () => {
      mockHouseGet.mockResolvedValue({
        exists: true,
        data: () => ({ ownerId: 'someone-else' }),
      });
      await expect(
        call(
          addGuestAuthorization,
          { userId: 'newguest-uid', houseId: 'house-1', isAdmin: false },
          { uid: 'admin-uid', token: { admin: { 'house-OTHER': true } } },
        ),
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });
  ```

- [ ] **Step 2: Add the guard to `addGuestAuthorization`**

  Mirror the structure of the addAdminAuthorization guard. Single house ID this time, no `superAdmin` array:

  ```ts
  // Inside addGuestAuthorization, after parseInput:
  const callerUid = request.auth.uid;
  const snap = await admin
    .firestore()
    .collection('houses')
    .doc(guest.houseId)
    .get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `House ${guest.houseId} not found`);
  }
  const house = snap.data() as { ownerId?: string };
  const callerToken = request.auth.token as any;
  const isOwner = house.ownerId === callerUid;
  const callerIsExistingAdmin =
    callerToken?.admin?.[guest.houseId] === true ||
    callerToken?.superAdmin?.[guest.houseId] === true;
  const isDelegation = guest.userId !== callerUid;
  if (!(isOwner || (callerIsExistingAdmin && isDelegation))) {
    logger.warn('addGuestAuthorization: denied', {
      callerUid,
      targetUid: guest.userId,
      houseId: guest.houseId,
    });
    throw new HttpsError(
      'permission-denied',
      'Not authorized to grant guest role for this house',
    );
  }
  ```

- [ ] **Step 3: Run tests**

  Run: `cd ~/dev/regroup-functions/functions && npx jest src/__tests__/callable/auth.test.ts`
  Expected: pass.

- [ ] **Step 4: Commit**

  ```bash
  cd ~/dev/regroup-functions
  git add functions/src/callable/auth.ts functions/src/__tests__/callable/auth.test.ts
  git commit -m "security(auth): gate addGuestAuthorization to owner OR delegating admin"
  ```

---

## Phase F: Cleanup (after a sunset window)

This phase runs only after the operator has confirmed no users are stuck on legacy URL-payload invitations (e.g., monitoring `addAdminAuthorization` deny logs for two weeks, or seeing zero non-token deep-link signups in analytics).

**Files:**

- Modify: `src/services/native-deep-links.ts` (remove legacy parser branch + `createNewInviteLink`)
- Modify: `src/screens/SignUp/SignUpForm.tsx` (remove `addAdminAuthorization` / `addGuestAuthorization` fallback)
- Modify: `src/services/setup-wizard.ts` (remove the legacy invite-builder helpers if any remain)

### Task 13: Remove legacy paths

- [ ] **Step 1: Confirm the sunset window has elapsed**

  Per Phase E recommendation: check Cloud Function logs for `addAdminAuthorization: denied` and `addGuestAuthorization: denied` warnings. If the volume is zero for a 14-day window, proceed. Otherwise: investigate first (real users are signing up via legacy links).

- [ ] **Step 2: Remove the legacy parser branch**

  In `src/services/native-deep-links.ts`, drop the `if (query.house...)` block from `createInvitationFromLink`. The function now only handles `?token=`.

- [ ] **Step 3: Remove `createNewInviteLink`**

  Delete the `createNewInviteLink` export and its callers in `src/services/debug-deep-links.ts`. The function is no longer used in production — Phase D switched the inviter side to `createInvitation`.

- [ ] **Step 4: Remove the fallback branch in `SignUpForm.tsx`**

  Delete the `else` branches that call `addAdminAuthorization`/`addGuestAuthorization`. Every invitation now has a `token` field; if it doesn't, throw an explicit error pointing at the operator.

- [ ] **Step 5: Run the full test suite + commit**

  ```bash
  cd /Users/marcuspersonal/dev/Regroup
  npm test -- --no-coverage
  git add src/services/native-deep-links.ts src/services/debug-deep-links.ts src/screens/SignUp/SignUpForm.tsx
  git commit -m "chore(invitations): remove legacy URL-payload deep-link path"
  ```

- [ ] **Step 6: Document the migration in the audit memo**

  Update `.full-review/03-s2-cross-repo-audit.md` with a closing note: "Step 2 complete on YYYY-MM-DD; legacy path removed in Phase F."

---

## Self-Review

**Spec coverage** (against the audit memo Step 2 sketch):

| Audit point                                                  | Implementing task |
| ------------------------------------------------------------ | ----------------- |
| 1. New CF `createInvitation` (admin/owner-only)              | Task 3            |
| 2. New CF `redeemInvitation` (token + email match)           | Task 5            |
| 3. `invitations` collection rules (admin-only / server-only) | Task 6            |
| 4. Mobile deep-link parser simplified to opaque token        | Task 7, Task 13   |
| 5. Mobile signup calls `redeemInvitation`                    | Task 9            |
| 6. `addAdminAuthorization` restricted to delegation          | Task 11           |
| (implicit) `addGuestAuthorization` parallel hardening        | Task 12           |
| (implicit) `peekInvitation` for signup form pre-fill         | Task 4            |
| (implicit) email helper extracted from `sendInviteEmails`    | Task 2            |
| (implicit) inviter side migrated to `createInvitation`       | Task 10           |
| (implicit) Cleanup after sunset window                       | Task 13           |

**Placeholder scan:** None. Every step has concrete code; every test case specifies inputs and expected outputs.

**Type consistency:**

- `Invitation` entity defined in Task 1, consumed in Tasks 3/4/5/7/9. Field names (`token`, `inviterUid`, `houseId`, `role`, `invitedEmail`, `initialPhase`, `expiresAt`, `createdAt`, `redeemedAt`, `redeemedByUid`) are stable across files.
- `InvitationRole = "admin" | "guest" | "senior-peer"` — same union in CF entity (Task 1) and mobile service (Task 8). The old `Invitation.type` union in mobile (`"admin" | "guest" | "superAdmin" | "supporter" | "senior-peer"`) is a superset; Phase F may want to narrow it but mobile-side typing stays compatible during the transition because the redeemer only handles three roles.
- `peekInvitation` returns `{ houseId, role, invitedEmail, initialPhase?, expiresAt }` in both the CF (Task 4) and the mobile wrapper (Task 8).
- `redeemInvitation` returns `{ houseId, role }` in both repos.
- `createInvitation` accepts `{ email, houseId, role, initialPhase? }` and returns `{ token }` in both repos.

**One-way doors:**

- Phase E hardening BREAKS the signup-via-deep-link flow for users whose mobile build is older than Phase C. The sunset window in Phase F assumes operators force-upgraded the app or otherwise bridged users off the legacy path. If you can't force upgrade, do Phase E AFTER you know everyone is on a Phase-C build.
- Token storage: 32-byte base64url is overkill from a cryptographic perspective but cheap and matches industry norms (Stripe Checkout sessions are similar length). The doc-as-token-id pattern means rotations require re-issuing the link.

**Cross-repo coordination:**

- Phases A + B can ship in either order (they're independent).
- Phase C requires Phase A deployed (the CFs must be live before mobile code calls them).
- Phase D requires Phase C in mobile (the parser must handle the new format before any inviter-side calls produce one).
- Phase E requires Phase D (legacy CFs only get hardened once nobody legitimately calls them from a signup context).

Each phase produces a working release; partial rollouts are safe.
