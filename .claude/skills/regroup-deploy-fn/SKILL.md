---
name: regroup-deploy-fn
description: Deploy one or more specific Firebase Cloud Functions by name. Faster and safer than deploying all functions. Usage: /deploy-fn <functionName> [functionName2 ...]
disable-model-invocation: true
---

> **Unit:** `regroup/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup"` first.
# Deploy Specific Firebase Function(s)

Deploys only the named function(s), skipping the full redeploy.

## Usage

```
/deploy-fn adHocTransfer
/deploy-fn stripeEvents onboardStripeConnectUser
```

## Steps

1. Build TypeScript first:

```bash
cd functions && npm run build
```

If the build fails, stop here and report the errors. Do not deploy a broken build.

2. Deploy only the specified function(s):

```bash
firebase deploy --only functions:<functionName>
# For multiple: firebase deploy --only functions:fnOne,functions:fnTwo
```

3. Tail logs to confirm the function is running:

```bash
firebase functions:log --only <functionName> 2>&1 | head -30
```

## Notes

- All function names are camelCase exports from `functions/src/index.ts`
- Run from the repo root (firebase.json must be present)
- Callable functions (`src/callable/`) and HTTP endpoints (`src/http/`) deploy identically
- Firestore/Database/PubSub triggers can only be deployed this way if they've been deployed before; a first-time deploy may require `firebase deploy --only functions`
