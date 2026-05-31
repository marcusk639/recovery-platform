# Deployment

The site deploys to **Firebase App Hosting** — a managed Cloud Run-based hosting service that handles Next.js SSR automatically. No Dockerfile or build configuration needed beyond `apphosting.yaml`.

**Firebase project:** `nextsteprecovery-1d5c2`  
**Backend:** `nextstep-recovery` (`us-central1`)

---

## Prerequisites

- Node 20+ (`nvm use 20`)
- Firebase CLI authenticated (`firebase login`)
- Firebase project on Blaze (pay-as-you-go) plan

```bash
# Verify login and project
firebase projects:list
firebase use nextsteprecovery-1d5c2
```

---

## One-time Setup (already done)

The following have already been completed and are committed to the repo:

- `firebase.json` — App Hosting backend config
- `apphosting.yaml` — env vars (public) and secret references (names only, not values)
- Firebase App Hosting backend `nextstep-recovery` created in `us-central1`

---

## Secrets Setup (required before first deploy)

API keys are stored in Firebase Secret Manager — not in `apphosting.yaml` or git. Run these once:

```bash
firebase apphosting:secrets:set resend-api-key
# paste your Resend API key when prompted

firebase apphosting:secrets:set mailerlite-api-key
# paste your MailerLite API key when prompted
```

Verify secrets are accessible:

```bash
firebase apphosting:secrets:list
```

---

## Deploy

```bash
nvm use 20
firebase deploy
```

This runs the Next.js build on Cloud Run and deploys all routes. The deploy command reads `firebase.json` and `apphosting.yaml` to configure the backend.

**Expected output:**

```
✔ Deploy complete!
Hosting URL: https://nextstep-recovery--nextsteprecovery-1d5c2.us-central1.hosted.app
```

---

## Environment Variables in Production

Public vars (Stripe URLs, Calendly URLs, MailerLite group IDs, `RESEND_TO_EMAIL`) are committed in `apphosting.yaml` and injected at build time. They do not need to be set separately.

Secret vars (`RESEND_API_KEY`, `MAILERLITE_API_KEY`) are referenced in `apphosting.yaml` by name (`secret: resend-api-key`) and pulled from Firebase Secret Manager at runtime.

```yaml
# apphosting.yaml pattern:
- variable: RESEND_API_KEY
  secret: resend-api-key # <-- name in Secret Manager, not the value
  availability:
    - RUNTIME
```

### Adding a new secret

```bash
# Create the secret
firebase apphosting:secrets:set my-new-secret

# Reference it in apphosting.yaml
- variable: MY_NEW_VAR
  secret: my-new-secret
  availability:
    - RUNTIME
```

### Adding a new public env var

Add directly to `apphosting.yaml` under `env:`:

```yaml
- variable: NEXT_PUBLIC_NEW_URL
  value: "https://example.com/link"
  availability:
    - BUILD
    - RUNTIME
```

`NEXT_PUBLIC_*` vars need both `BUILD` and `RUNTIME`. Server-only vars need only `RUNTIME`.

---

## Build Configuration

`apphosting.yaml` run config:

```yaml
runConfig:
  cpu: 1
  memoryMiB: 512
  concurrency: 80
  minInstances: 0 # scales to zero when idle
  maxInstances: 10
```

`minInstances: 0` means cold starts are possible on the first request after idle. For a low-traffic site this is fine and keeps costs minimal.

---

## Checking Deploy Status

```bash
firebase apphosting:backends:list
```

Logs are in the Google Cloud Console → Cloud Run → `nextstep-recovery`.

---

## Custom Domain

The Firebase App Hosting backend URL is long. To use `nextsteprecovery.com`:

1. Firebase Console → App Hosting → your backend → **Add custom domain**
2. Follow the DNS verification steps (add a TXT record, then a CNAME or A record at your registrar)
3. Firebase provisions a managed TLS certificate automatically

---

## Local Development vs. Production

|               | Local                                    | Production                       |
| ------------- | ---------------------------------------- | -------------------------------- |
| Secrets       | `.env.local` (fill manually)             | Firebase Secret Manager          |
| Public vars   | `.env.local` (pre-filled by `setup:env`) | `apphosting.yaml`                |
| Server        | `npm run dev`                            | Cloud Run (Firebase App Hosting) |
| Node version  | 20+ (use `nvm use 20`)                   | Managed by Firebase              |
| Verify config | `npm run verify:services`                | Check Firebase console / logs    |
