# detox-recovery — Feature Flowcharts

Next.js 15 App Router marketing + lead-capture site (`nextstep-recovery`). All node labels are `Name<br/>file:line` with verified line numbers. File paths are relative to `detox-recovery/`.

---

## Shared Upstream Gate: Abuse-Protection Pipeline

Both POST routes (`/api/contact`, `/api/subscribe`) run an identical 3-stage gate before any handler logic, plus a separate edge-middleware rate limiter. This subgraph is referenced by features 2 and 3.

```mermaid
flowchart TD
    REQ["Incoming POST request"]

    subgraph MW["Edge middleware (runs first, per matcher)"]
        MWmatch["match pathname<br/>middleware.ts:20"]
        MWlimit["lookup LIMITS map<br/>contact=5/60s, subscribe=10/60s<br/>middleware.ts:8"]
        MWcount["in-memory counts Map<br/>middleware.ts:6"]
        MW429["429 Too Many Requests<br/>middleware.ts:35"]
        MWnext["NextResponse.next()<br/>middleware.ts:47"]
    end

    subgraph GATE["Route-handler gate (abuse-protection.ts)"]
        ORIGIN{"checkOrigin ok?<br/>abuse-protection.ts:19"}
        ORIGIN403["403 Forbidden"]
        RL{"checkRateLimit ok?<br/>60s/IP per route<br/>abuse-protection.ts:47"}
        RL429["429 + Retry-After"]
        PARSE["parse req.json()<br/>(handler)"]
        BAD400["400 Invalid JSON body"]
        HONEY{"checkHoneypot ok?<br/>field 'website' empty?<br/>abuse-protection.ts:27"}
        SILENT["200 {success:true}<br/>silent bot drop"]
        OK["proceed to handler logic"]
    end

    REQ --> MWmatch
    MWmatch -->|no match| MWnext
    MWmatch -->|match| MWlimit --> MWcount
    MWcount -->|count >= max| MW429
    MWcount -->|under limit| MWnext
    MWnext --> ORIGIN
    ORIGIN -->|no| ORIGIN403
    ORIGIN -->|yes| RL
    RL -->|no| RL429
    RL -->|yes| PARSE
    PARSE -->|throws| BAD400
    PARSE -->|ok| HONEY
    HONEY -->|filled honeypot| SILENT
    HONEY -->|empty| OK
```

**Side effects / state:**

- In-memory `counts` Map in `middleware.ts:6` (sliding window, single-instance only).
- In-memory `rateLimitState` Map in `abuse-protection.ts:34` (60s window/IP/route; self-prunes at >10k entries, `abuse-protection.ts:65`).
- Origin allow-list read from `process.env.ALLOWED_ORIGINS` else defaults (`abuse-protection.ts:9`).
- `getClientIp` reads `x-forwarded-for` / `x-real-ip`; `"unknown"` skips rate limit (`abuse-protection.ts:54`).

**External deps:** none (pure in-process).

---

## Feature 1: Marketing Pages / Service Ladder

Static server-rendered pages. No runtime data fetching — all content is typed constants imported at build/render time.

```mermaid
flowchart TD
    HOME["GET / → Home()<br/>app/page.tsx:5"]
    HERO["HeroSection<br/>app/page.tsx:8"]
    TRUST["TrustSignals (renders CANNOT_HELP_WITH)<br/>app/page.tsx:9"]
    PREVIEW["ServiceLadderPreview<br/>app/page.tsx:10"]

    SVC["GET /services → ServicesPage()<br/>app/services/page.tsx:15"]
    CMP["ServiceComparisonTable<br/>app/services/page.tsx:31"]
    TIERS["map SERVICE_TIERS → ServiceCard[]<br/>app/services/page.tsx:36"]
    WHAT["WhatICanHelp (renders CAN_HELP_WITH)<br/>app/services/page.tsx:48"]
    REFTRIG["ReferralTriggers<br/>app/services/page.tsx:52"]

    DATA_TIERS["SERVICE_TIERS[] (5 tiers)<br/>lib/services-data.ts:15"]
    ENV_CAL["NEXT_PUBLIC_CALENDLY_FIT_CHECK_URL ?? '#'<br/>lib/services-data.ts:26"]
    ENV_STRIPE["NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL ?? '#'<br/>lib/services-data.ts:39"]
    SCOPE["CAN_HELP_WITH / CANNOT_HELP_WITH<br/>lib/scope-of-practice.ts:19"]

    HTML["Rendered HTML (terminal)"]

    HOME --> HERO --> TRUST --> PREVIEW
    TRUST --> SCOPE
    HOME --> HTML

    SVC --> CMP --> TIERS --> WHAT --> REFTRIG
    TIERS --> DATA_TIERS
    DATA_TIERS --> ENV_CAL
    DATA_TIERS --> ENV_STRIPE
    WHAT --> SCOPE
    SVC --> HTML
```

**Side effects / state:** none at request time. CTA hrefs resolved from `NEXT_PUBLIC_*` env vars at module load with `?? "#"` fallback (`lib/services-data.ts:26,39,40`).

**External deps:** Calendly + Stripe URLs (static redirect links, not SDK calls). No network I/O during render.

---

## Feature 2: Contact / Lead Capture

`POST /api/contact`. Runs the shared gate, validates fields, sends email via Resend, and conditionally fires a recovery-api referral in parallel. **The referral fetch path is functionally present in code but inert in production** (env vars commented out in `apphosting.yaml`).

```mermaid
flowchart TD
    POST["POST /api/contact → POST()<br/>app/api/contact/route.ts:49"]
    GATE["Abuse-protection gate<br/>(see shared subgraph)<br/>route.ts:50,54,74"]

    VNAME{"name valid?<br/>route.ts:78"}
    E_NAME["400 Name is required"]
    VEMAIL{"email matches EMAIL_RE?<br/>route.ts:83"}
    E_EMAIL["400 Valid email is required"]
    VMSG{"message present?<br/>route.ts:89"}
    E_MSG["400 Message is required"]

    ENVCHK{"RESEND_API_KEY & RESEND_TO_EMAIL set?<br/>route.ts:93"}
    SILENT200["200 {success:true}<br/>(silent no-op)<br/>route.ts:97"]

    SANITIZE["sanitize/clamp fields<br/>strip CRLF, validate interest<br/>route.ts:102-120"]
    MAPAPP["interest → toApp via INTEREST_TO_APP<br/>route.ts:122<br/>(Sober Living→phoenix-cleanhouse,<br/>12-Step→homegroups)"]

    REFPROM["referralPromise = fireReferral(...) or Promise.resolve()<br/>route.ts:123"]
    FIRE["fireReferral(): POST {SHARED_API_URL}/api/referrals<br/>X-Service-Key header, 5s timeout<br/>route.ts:28 / fetch route.ts:38"]
    DISABLED{"SHARED_API_URL & INTERNAL_API_KEY set?<br/>route.ts:36 — DISABLED in prod<br/>(early-return if unset)"}

    EMAILPROM["sendEmailPromise = resend.emails.send(...)<br/>route.ts:127"]

    SETTLE["await Promise.allSettled([email, referral])<br/>route.ts:141"]
    EMAILREJ{"email rejected?<br/>route.ts:146"}
    E_502["502 Failed to send message<br/>route.ts:148"]
    REFREJ{"referral rejected?<br/>route.ts:154"}
    LOGREF["console.error referral failed (logged, non-fatal)<br/>route.ts:157"]
    SUCCESS["200 {success:true} (terminal)<br/>route.ts:160"]

    POST --> GATE --> VNAME
    VNAME -->|no| E_NAME
    VNAME -->|yes| VEMAIL
    VEMAIL -->|no| E_EMAIL
    VEMAIL -->|yes| VMSG
    VMSG -->|no| E_MSG
    VMSG -->|yes| ENVCHK
    ENVCHK -->|missing| SILENT200
    ENVCHK -->|present| SANITIZE --> MAPAPP
    MAPAPP --> REFPROM
    MAPAPP --> EMAILPROM
    REFPROM -. "if interest mapped" .-> FIRE
    FIRE -. "early return, no fetch" .-> DISABLED
    EMAILPROM --> SETTLE
    REFPROM --> SETTLE
    SETTLE --> EMAILREJ
    EMAILREJ -->|yes| E_502
    EMAILREJ -->|no| REFREJ
    REFREJ -->|yes| LOGREF --> SUCCESS
    REFREJ -->|no| SUCCESS

    classDef disabled stroke-dasharray: 5 5,stroke:#b45309,color:#b45309;
    class FIRE,DISABLED disabled;
```

**Disabled referral firing (key finding):**

- Function `fireReferral` defined at `app/api/contact/route.ts:28`; the actual outbound `fetch` to `${SHARED_API_URL}/api/referrals` is at `app/api/contact/route.ts:38`.
- It is gated by `if (!url || !key) return;` at `app/api/contact/route.ts:36` — `SHARED_API_URL` / `INTERNAL_API_KEY` are commented out in `apphosting.yaml`, so in production it early-returns and **never fires** (inert).
- Dispatch mechanism is **`Promise.allSettled`** (NOT fire-and-forget): `const [emailResult, referralResult] = await Promise.allSettled([sendEmailPromise, referralPromise])` at `app/api/contact/route.ts:141`. The code comment at `route.ts:137-140` explicitly forbids refactoring to `void fireReferral(...)` because Cloud Run throttles background CPU after handler return.
- Only the `"Sober Living / Housing"` and `"12-Step / Homegroup Support"` interests map to a `toApp` (`route.ts:23-26`); all other interests yield `Promise.resolve()` (`route.ts:125`).

**Side effects / state:**

- Outbound Resend email send (`route.ts:127`).
- Conditional outbound fetch to recovery-api (`route.ts:38`, disabled).
- Env reads: `RESEND_API_KEY`, `RESEND_TO_EMAIL` (`route.ts:93-94`), `RESEND_FROM_EMAIL` (`route.ts:129`), `SHARED_API_URL`, `INTERNAL_API_KEY` (`route.ts:34-35`).
- Shared in-memory rate-limit state (see gate).
- Client driver: `ContactForm` POSTs JSON incl. honeypot `website` (`components/contact/ContactForm.tsx:74`).

**External deps:** Resend (`resend` SDK, `route.ts:2`), recovery-api `/api/referrals` (disabled).

---

## Feature 3: Newsletter / Subscribe (MailerLite)

`POST /api/subscribe`. Same upstream gate, then validates email + tag, maps tag → MailerLite group ID, and POSTs to MailerLite.

```mermaid
flowchart TD
    POST["POST /api/subscribe → POST()<br/>app/api/subscribe/route.ts:29"]
    GATE["Abuse-protection gate<br/>(see shared subgraph)<br/>route.ts:30,34,54"]

    VEMAIL{"email matches EMAIL_RE?<br/>route.ts:60"}
    E_EMAIL["400 Valid email is required<br/>route.ts:66"]
    VTAG{"tag in KNOWN_TAGS?<br/>route.ts:74"}
    E_TAG["400 Invalid subscription tag<br/>route.ts:75"]

    MAPGRP["groupId = GROUP_IDS[tag]<br/>route.ts:82"]
    ENVCHK{"MAILERLITE_API_KEY & groupId set?<br/>route.ts:85"}
    SILENT200["200 {success:true} (silent no-op)<br/>route.ts:86"]

    FETCH["fetch connect.mailerlite.com/api/subscribers<br/>Bearer auth, 8s timeout<br/>route.ts:91"]
    NETERR{"network throw?<br/>route.ts:100"}
    E_502N["502 Subscription failed<br/>route.ts:102"]
    HTTPERR{"!mlRes.ok?<br/>route.ts:108"}
    LOGERR["console.error status+tag (NO body — PII)<br/>route.ts:111"]
    E_502H["502 Subscription failed<br/>route.ts:115"]
    SUCCESS["200 {success:true} (terminal)<br/>route.ts:121"]

    POST --> GATE --> VEMAIL
    VEMAIL -->|no| E_EMAIL
    VEMAIL -->|yes| VTAG
    VTAG -->|no| E_TAG
    VTAG -->|yes| MAPGRP --> ENVCHK
    ENVCHK -->|missing| SILENT200
    ENVCHK -->|present| FETCH --> NETERR
    NETERR -->|yes| E_502N
    NETERR -->|no| HTTPERR
    HTTPERR -->|yes| LOGERR --> E_502H
    HTTPERR -->|no| SUCCESS
```

**Side effects / state:**

- Outbound fetch to MailerLite (`route.ts:91`).
- Env reads: `MAILERLITE_API_KEY` (`route.ts:83`), group IDs `MAILERLITE_GROUP_ID_NEWSLETTER` / `_LEAD_MAGNET_UNSAFE` / `_LEAD_MAGNET_FAMILY` / `_B2B` (`route.ts:21-27`).
- Deliberately logs status + tag only, never response body, to avoid PII leak (`route.ts:109-111`).
- Shared in-memory rate-limit state (see gate).
- Client driver: `LeadMagnetForm` POSTs `{email, tag, website}` (`components/resources/LeadMagnetForm.tsx:34`).

**External deps:** MailerLite REST API (`connect.mailerlite.com`).

---

## Feature 4: Resources / Products (Lemon Squeezy)

Static page. Partitions `PRODUCTS` into paid / free / newsletter / donation buckets at module load, renders cards. Paid PDFs link to Lemon Squeezy checkout URLs (plain hrefs, no SDK).

```mermaid
flowchart TD
    PAGE["GET /resources → ResourcesPage()<br/>app/resources/page.tsx:22"]

    PARTITION["module-load partition of PRODUCTS<br/>app/resources/page.tsx:13-20"]
    PAID["paidProducts (price!=free, not newsletter/donation)<br/>app/resources/page.tsx:13"]
    FREE["freeProducts (free lead-magnets)<br/>app/resources/page.tsx:16"]
    NEWS["newsletter (type==newsletter)<br/>app/resources/page.tsx:19"]
    DON["donation (id==donation)<br/>app/resources/page.tsx:20"]

    DATA["PRODUCTS[]<br/>lib/products-data.ts:18"]
    ENV_LS["NEXT_PUBLIC_LEMONSQUEEZY_*_URL ?? '#'<br/>lib/products-data.ts:27,37,47,58,68"]
    ENV_DON["NEXT_PUBLIC_STRIPE_DONATION_URL ?? '#'<br/>lib/products-data.ts:118"]

    FREECARDS["map freeProducts → ProductCard[]<br/>app/resources/page.tsx:38"]
    LM1["LeadMagnetForm tag=lead-magnet-unsafe<br/>app/resources/page.tsx:50"]
    LM2["LeadMagnetForm tag=lead-magnet-family<br/>app/resources/page.tsx:54"]
    PAIDCARDS["map paidProducts → ProductCard[]<br/>app/resources/page.tsx:70"]
    NEWSFORM["LeadMagnetForm tag=newsletter-...<br/>app/resources/page.tsx:83"]
    DONLINK["donation CTA anchor → ctaHref<br/>app/resources/page.tsx:95"]

    CARDCHK{"product.availability == coming-soon?<br/>components/resources/ProductCard.tsx:11"}
    DISABLED_BTN["disabled 'Available soon' span<br/>ProductCard.tsx:27"]
    CTA_BTN["Button href=ctaHref (Lemon Squeezy)<br/>ProductCard.tsx:31"]

    HTML["Rendered HTML (terminal)"]

    PAGE --> PARTITION
    PARTITION --> PAID & FREE & NEWS & DON
    PARTITION --> DATA
    DATA --> ENV_LS
    DATA --> ENV_DON
    PAGE --> FREECARDS --> CARDCHK
    PAGE --> LM1 & LM2 & NEWSFORM
    PAGE --> PAIDCARDS --> CARDCHK
    PAGE --> DONLINK
    CARDCHK -->|yes| DISABLED_BTN
    CARDCHK -->|no| CTA_BTN
    LM1 & LM2 & NEWSFORM -. "submit" .-> SUBSCRIBE["POST /api/subscribe (Feature 3)"]
    PAGE --> HTML
```

**Side effects / state:** none at request time. Lemon Squeezy + Stripe-donation URLs resolved from `NEXT_PUBLIC_*` env at module load with `?? "#"` fallback. The 5 paid PDFs render as disabled "Available soon" when `availability === "coming-soon"` (`ProductCard.tsx:11`). Embedded `LeadMagnetForm`s feed Feature 3.

**External deps:** Lemon Squeezy checkout (static redirect link), Stripe donation link (static). No SDK / network during render.

---

## Feature 5: B2B Consulting

Static page. Renders consulting hero, offers grid, and a B2B lead magnet form. Each offer CTA deep-links to `/contact?interest=...`, pre-filling the contact form.

```mermaid
flowchart TD
    PAGE["GET /consulting → ConsultingPage()<br/>app/consulting/page.tsx:13"]
    HERO["ConsultingHero<br/>app/consulting/page.tsx:16"]
    OFFERS["B2BOffers (renders B2B_OFFERS)<br/>app/consulting/page.tsx:17"]
    LEADMAG["B2BLeadMagnet<br/>app/consulting/page.tsx:18"]
    CONTACTLINK["anchor → /contact<br/>app/consulting/page.tsx:33"]

    DATA["B2B_OFFERS[] (6 offers)<br/>lib/consulting-data.ts:10"]
    CTAHREFS["each ctaHref = /contact?interest=...<br/>lib/consulting-data.ts:21,33,45,57,67,78"]

    PREFILL["/contact?interest= pre-fills dropdown<br/>(ContactForm defaultInterest, Feature 2)"]
    HTML["Rendered HTML (terminal)"]

    PAGE --> HERO --> OFFERS --> LEADMAG
    PAGE --> CONTACTLINK
    OFFERS --> DATA --> CTAHREFS
    CTAHREFS -. "click" .-> PREFILL
    LEADMAG -. "submit tag=lead-magnet-b2b" .-> SUBSCRIBE["POST /api/subscribe (Feature 3)"]
    PAGE --> HTML
```

**Side effects / state:** none at request time. `B2BLeadMagnet` form submits to `/api/subscribe` (Feature 3) with `tag=lead-magnet-b2b`. Offer CTAs route to `/contact?interest=` which pre-fills `ContactForm` (Feature 2).

**External deps:** none during render (downstream subscribe → MailerLite).

---

## Feature 6: Referral Safety Triggers

Pure presentational client-safe component. Renders the hard-coded clinical-safety list that always points users to emergency/medical care — never to site services. Embedded on `/services` (Feature 1).

```mermaid
flowchart TD
    COMP["ReferralTriggers()<br/>components/services/ReferralTriggers.tsx:3"]
    HEADER["heading + intro copy<br/>ReferralTriggers.tsx:6,9"]
    MAP["map REFERRAL_CONDITIONS → li[]<br/>ReferralTriggers.tsx:15"]
    DATA["REFERRAL_CONDITIONS (16 conditions)<br/>lib/referral-conditions.ts:1"]
    CRISIS["crisis footer: 988 / 911 / ER<br/>ReferralTriggers.tsx:25"]
    HTML["Rendered amber warning panel (terminal)"]

    COMP --> HEADER --> MAP
    MAP --> DATA
    MAP --> CRISIS --> HTML
```

**Side effects / state:** none. Read-only render of a frozen `as const` array (`lib/referral-conditions.ts:1-18`). Editing the array is a clinical-safety change.

**External deps:** none.

---

## Feature 7: Abuse-Protection / Security Pipeline

The pipeline itself, as a standalone feature. Two layers: (a) Next.js edge `middleware.ts` rate limiter scoped to the two API routes, (b) the in-handler `abuse-protection.ts` primitives. Both layers maintain independent in-memory state.

```mermaid
flowchart TD
    subgraph EDGE["Layer A — Edge middleware.ts"]
        MW["middleware(req)<br/>middleware.ts:19"]
        MATCH{"pathname in LIMITS?<br/>matcher=/api/contact,/api/subscribe<br/>middleware.ts:21,51"}
        PASS["NextResponse.next() (pass)<br/>middleware.ts:22"]
        IP["clientIp from x-forwarded-for<br/>middleware.ts:13"]
        ENTRY["counts.get(key) window check<br/>middleware.ts:6,26"]
        NEWWIN["reset window, count=1<br/>middleware.ts:29"]
        OVER{"count >= max?<br/>middleware.ts:33"}
        MW429["429 + Retry-After + X-RateLimit-*<br/>middleware.ts:35"]
        INC["count++ , next()<br/>middleware.ts:46"]
    end

    subgraph HANDLER["Layer B — abuse-protection.ts primitives"]
        CO["checkOrigin: origin in allow-list?<br/>abuse-protection.ts:19"]
        COgetorigins["getAllowedOrigins (env or defaults)<br/>abuse-protection.ts:8"]
        CR["checkRateLimit: 60s/IP/route<br/>abuse-protection.ts:47"]
        CRip["getClientIp; 'unknown' → skip<br/>abuse-protection.ts:36,54"]
        CRstate["rateLimitState Map + prune>10k<br/>abuse-protection.ts:34,65"]
        CH["checkHoneypot: 'website' empty?<br/>abuse-protection.ts:27"]
        RESET["_resetRateLimit (test helper)<br/>abuse-protection.ts:74"]
    end

    REQ["POST /api/contact or /api/subscribe"] --> MW --> MATCH
    MATCH -->|no| PASS
    MATCH -->|yes| IP --> ENTRY
    ENTRY -->|expired/none| NEWWIN --> PASS
    ENTRY -->|active| OVER
    OVER -->|yes| MW429
    OVER -->|no| INC --> PASS
    PASS --> CO
    CO --> COgetorigins
    CO --> CR
    CR --> CRip --> CRstate
    CR --> CH
    CH --> DONE["handler proceeds / 403 / 429 / silent 200"]
```

**Side effects / state:**

- `middleware.ts:6` `counts` Map — per-pathname+IP sliding window (`{count, resetAt}`), single-instance.
- `abuse-protection.ts:34` `rateLimitState` Map — per-IP+route last-hit timestamp, 60s window, self-prunes at >10k (`abuse-protection.ts:65`).
- Origin allow-list from `ALLOWED_ORIGINS` env or `DEFAULT_ALLOWED_ORIGINS` (`abuse-protection.ts:1,9`).
- `_resetRateLimit()` test-only state reset (`abuse-protection.ts:74`).
- Note: two independent rate limiters exist (edge middleware 5/10 per min by path+IP, plus handler `checkRateLimit` 1 per 60s per IP+route). Both run on every contact/subscribe POST.

**External deps:** none (entirely in-process).

---

### Cross-feature notes

- Contact route referral firing is the only path with cross-product (recovery-api) intent, and it is currently inert.
- Forms (Contact, LeadMagnet x3, B2BLeadMagnet) all include `<HoneypotInput name="website">` (`components/forms/HoneypotInput.tsx:8`) feeding the honeypot gate.
- No database / CMS: all page content is typed constants in `lib/*-data.ts`.
