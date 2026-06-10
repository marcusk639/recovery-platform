# recovery-api — Feature Flowcharts

Happy-path traces for each recovery-api feature. All callable functions share the
`requireServiceAuth` gate (`src/middleware/auth.ts:22`) as an upstream node before any
business logic runs. Firestore access goes through `getFirestore()` from
firebase-admin (collections noted per write/read).

---

## Cross-app Referral API

Three callable functions (`createReferral`, `getReferrals`, `getReferral`) all defined
in `src/callable/referrals.ts`. Each resolves auth via the shared middleware gate, then
delegates to a pure handler that reads/writes the `referrals` Firestore collection.

```mermaid
flowchart TD
    subgraph Auth["Shared auth gate"]
        G[requireServiceAuth<br/>src/middleware/auth.ts:22]
    end

    %% createReferral
    CR_entry[createReferral onCall<br/>src/callable/referrals.ts:72]
    CR_entry --> G
    G --> CR_h[handleCreateReferral<br/>src/callable/referrals.ts:23]
    CR_h --> CR_parse[CreateReferralSchema.parse data<br/>src/callable/referrals.ts:28]
    CR_parse --> CR_add[("db referrals .add<br/>src/callable/referrals.ts:29")]
    CR_add --> CR_ret[return id + status pending<br/>src/callable/referrals.ts:37]

    %% getReferrals
    GRS_entry[getReferrals onCall<br/>src/callable/referrals.ts:80]
    GRS_entry --> G
    G --> GRS_h[handleGetReferrals<br/>src/callable/referrals.ts:40]
    GRS_h --> GRS_query[("db referrals query referredBy+referredByApp limit 50<br/>src/callable/referrals.ts:44")]
    GRS_query --> GRS_map[map docs to Referral + id<br/>src/callable/referrals.ts:51]
    GRS_map --> GRS_ret[return referrals array<br/>src/callable/referrals.ts:55]

    %% getReferral
    GR_entry[getReferral onCall<br/>src/callable/referrals.ts:88]
    GR_entry --> G
    G --> GR_h[handleGetReferral<br/>src/callable/referrals.ts:58]
    GR_h --> GR_get[("db referrals doc id .get<br/>src/callable/referrals.ts:63")]
    GR_get --> GR_exists{doc.exists?<br/>src/callable/referrals.ts:64}
    GR_exists -- no --> GR_404[throw not-found<br/>src/callable/referrals.ts:64]
    GR_exists -- yes --> GR_owner{owner matches uid+appId?<br/>src/callable/referrals.ts:66}
    GR_owner -- no --> GR_403[throw permission-denied<br/>src/callable/referrals.ts:67]
    GR_owner -- yes --> GR_ret[return id + referral<br/>src/callable/referrals.ts:69]
```

**External deps**

- Service Auth Middleware — `requireServiceAuth` (`src/middleware/auth.ts:22`)
- Firestore `referrals` collection (write on create, query on list, doc get on fetch)
- `getFirestore()` injected at call sites (`src/callable/referrals.ts:76,84,92`)
- Secret `RECOVERY_PLATFORM_API_KEY` (`src/config.ts:11`) bound to each onCall
- Zod `CreateReferralSchema` validation (`src/callable/referrals.ts:15`)

---

## User Profile API

Two callable functions (`getUserProfile`, `updateUserProfile`) in `src/callable/users.ts`.
Both build a composite doc id `{appId}:{uid}` and touch the `users` Firestore collection.

```mermaid
flowchart TD
    subgraph Auth["Shared auth gate"]
        G[requireServiceAuth<br/>src/middleware/auth.ts:22]
    end

    %% getUserProfile
    GUP_entry[getUserProfile onCall<br/>src/callable/users.ts:38]
    GUP_entry --> G
    G --> GUP_h[handleGetUserProfile<br/>src/callable/users.ts:14]
    GUP_h --> GUP_id[docId = appId:uid<br/>src/callable/users.ts:18]
    GUP_id --> GUP_get[("db users doc docId .get<br/>src/callable/users.ts:19")]
    GUP_get --> GUP_exists{doc.exists?<br/>src/callable/users.ts:20}
    GUP_exists -- no --> GUP_null[return profile null<br/>src/callable/users.ts:20]
    GUP_exists -- yes --> GUP_ret[return profile User<br/>src/callable/users.ts:21]

    %% updateUserProfile
    UUP_entry[updateUserProfile onCall<br/>src/callable/users.ts:46]
    UUP_entry --> G
    G --> UUP_h[handleUpdateUserProfile<br/>src/callable/users.ts:24]
    UUP_h --> UUP_parse[UpdateProfileSchema.parse data<br/>src/callable/users.ts:29]
    UUP_parse --> UUP_id[docId = appId:uid<br/>src/callable/users.ts:30]
    UUP_id --> UUP_set[("db users doc .set merge true<br/>src/callable/users.ts:31")]
    UUP_set --> UUP_ret[return updated true<br/>src/callable/users.ts:35]
```

**External deps**

- Service Auth Middleware — `requireServiceAuth` (`src/middleware/auth.ts:22`)
- Firestore `users` collection (doc get on read, doc set/merge on update)
- `getFirestore()` injected at call sites (`src/callable/users.ts:42,50`)
- Secret `RECOVERY_PLATFORM_API_KEY` (`src/config.ts:11`) bound to each onCall
- Zod `UpdateProfileSchema` validation (`src/callable/users.ts:8`)
- `User` entity interface (`src/entities/User.ts:3`)

---

## Service Auth Middleware

`requireServiceAuth` is the shared gate invoked by every callable above. Happy path is
the Phase 1 service-key branch; Phase 2 (`request.auth` custom token) is the fallback.

```mermaid
flowchart TD
    SA_entry[requireServiceAuth request<br/>src/middleware/auth.ts:22]
    SA_entry --> SA_hdr[read headers x-service-key<br/>src/middleware/auth.ts:23]
    SA_hdr --> SA_env[apiKey = env RECOVERY_PLATFORM_API_KEY<br/>src/middleware/auth.ts:25]
    SA_env --> SA_match{apiKey set AND serviceKey == apiKey?<br/>src/middleware/auth.ts:27}

    SA_match -- yes Phase 1 --> SA_extract[read x-app-id / x-user-uid / x-user-email<br/>src/middleware/auth.ts:28]
    SA_extract --> SA_appcheck{appId valid in VALID_APP_IDS?<br/>src/middleware/auth.ts:32}
    SA_appcheck -- no --> SA_appthrow[throw unauthenticated bad app id<br/>src/middleware/auth.ts:33]
    SA_appcheck -- yes --> SA_uidcheck{uid present?<br/>src/middleware/auth.ts:38}
    SA_uidcheck -- no --> SA_uidthrow[throw unauthenticated missing uid<br/>src/middleware/auth.ts:39]
    SA_uidcheck -- yes --> SA_ctx1[return ServiceAuthContext appId/uid/email<br/>src/middleware/auth.ts:41]

    SA_match -- no --> SA_auth{request.auth present? Phase 2<br/>src/middleware/auth.ts:45}
    SA_auth -- yes --> SA_claim{appId claim valid?<br/>src/middleware/auth.ts:47}
    SA_claim -- no --> SA_claimthrow[throw unauthenticated bad claim<br/>src/middleware/auth.ts:48]
    SA_claim -- yes --> SA_ctx2[return ServiceAuthContext from token<br/>src/middleware/auth.ts:50]
    SA_auth -- no --> SA_unauth[throw unauthenticated Unauthorized<br/>src/middleware/auth.ts:57]
```

**External deps**

- `process.env.RECOVERY_PLATFORM_API_KEY` — secret resolved at runtime (`src/middleware/auth.ts:25`); secret defined in `src/config.ts:11`
- `VALID_APP_IDS` allowlist set (`src/middleware/auth.ts:12`)
- `CallableRequest` / `HttpsError` from firebase-functions/v2/https (`src/middleware/auth.ts:1`)
- No Firestore or external HTTP — pure header/token validation
- Consumed by: Cross-app Referral API and User Profile API (all five callables)

---

## Health / Liveness

`health` is an `onRequest` HTTP function with no auth gate and no Firestore access — a
pure liveness probe returning a JSON timestamp.

```mermaid
flowchart TD
    H_entry[health onRequest<br/>src/http/health.ts:9]
    H_entry --> H_handler[healthHandler req res<br/>src/http/health.ts:5]
    H_handler --> H_json[res.json ok true + ts ISO<br/>src/http/health.ts:6]
    H_json --> H_ret[HTTP 200 response sent<br/>src/http/health.ts:6]
```

**External deps**

- None — no auth, no Firestore, no external HTTP
- `Response` from express, `onRequest`/`Request` from firebase-functions/v2/https (`src/http/health.ts:1`)
