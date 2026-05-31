---
name: deploy-functions
description: Build, type-check, and deploy only changed Cloud Functions with pre-deploy validation
disable-model-invocation: true
---

# Deploy Cloud Functions

Deploy only changed Cloud Functions with pre-deploy validation.

## Steps

1. **Build and type-check**:

   ```bash
   cd functions && npm run build
   ```

   If build fails, stop and report errors.

2. **Run unit tests**:

   ```bash
   cd functions && npm test
   ```

   If tests fail, stop and report failures.

3. **Deploy changed functions only** (preferred over full deploy):

   ```bash
   cd functions && npm run deploy:changed
   ```

   If `deploy:changed` is not available or fails, fall back to:

   ```bash
   cd functions && npm run deploy
   ```

4. **Report results**: Show which functions were deployed and any warnings.

## Important

- Never deploy if build or tests fail
- Prefer `deploy:changed` over full `deploy` to minimize deployment risk
- If deploying security-sensitive functions (auth, payments), confirm with the user first
