---
description: Commits, component patterns, imports, selectors, known gotchas
globs: "src/**/*.{ts,tsx}"
---

# Conventions

## Commits

Conventional commits with domain scopes:

```
feat(oxford): add vote tallying
fix(payments): handle stripe webhook retry
refactor(state): migrate guestsSlice to React Query
```

## Component Organization

- Extract sub-components from large screens into the **same screen directory** — not into `src/components/`
- Reusable cross-screen components use `rats-` prefix: `rats-text-input`, `rats-datepicker`, `rats-scroll-view`

## Imports

- **No `@/` imports in source code** — use relative paths. `@/` is configured in Jest only (test imports).
- Named lodash imports only: `import { isEmpty } from 'lodash'` — no wildcard

## Redux Selectors

Memoize with `createSelector` in `src/state/selectors/`.

## File Extensions

- New entities and services: `.ts`
- Only use `.tsx` if the file exports JSX
- Legacy entity files use `.tsx` with embedded JSX helpers — do not replicate this pattern

## Forms

Formik + Yup for all form validation (`formik`, `yup` in dependencies).

## Known Legacy Gotchas

- `Auth` component (`src/components/auth/auth.tsx`) is a legacy class component — not yet migrated to hooks
- Some entity files have `.tsx` extension with embedded JSX helpers — read before modifying
