---
paths:
  - "**/src/**"
  - "**/app/**"
  - "detox-recovery/{components,lib}/**"
  - "detox-recovery/*.ts"
  - "scripts/**"
---

# Code Quality

## Size limits

| Entity   | Max lines | Enforcement                                                                 |
| -------- | --------- | --------------------------------------------------------------------------- |
| New file | 300       | `scripts/git-hooks/pre-commit` blocks it. Oversized legacy files only warn. |
| Function | 50        | Advisory. Treat as binding in new code.                                     |

When an edit pushes a legacy file further past 300, extract a module rather than growing it. Do not split a file just to dodge the hook. Split along a real seam.

## Complexity red flags

Stop and restructure when you see:

- More than 3 levels of nested `if`/`else`: extract a function or use early returns.
- More than 3 `try`/`catch` blocks in one function: split the error handling.
- More than 10 imports: the module probably does two jobs.
- Logic copied from another product's `functions/src/util(s)/`: there is no `shared/` package yet. Note the duplication instead of importing across products.

## Monorepo boundaries

- Never import from or query another product's package or Firestore. Cross-product calls go through `recovery-api`.
- Never log PII (names, contact info, health or recovery status). Log full error objects server-side; return sanitized messages to clients.
