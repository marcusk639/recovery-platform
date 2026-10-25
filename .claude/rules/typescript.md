---
paths: ['**/*.ts', '**/*.tsx']
---

# TypeScript

## Follow the package's existing conventions

Each package is independent. Strictness differs: `recovery-api`, `regroup/functions` and `detox-recovery` run `strict: true`, `homegroups/functions` does not. Do not loosen a strict package to make code compile.

Export style also differs. The mobile and web apps use default exports widely (several hundred files), while `recovery-api` uses only named exports. Match the file and package you are in; prefer named exports in new non-component modules.

## In new code

- `import type` for type-only imports.
- PascalCase for types, interfaces and components; camelCase for variables and functions; UPPER_CASE for constants.
- No `any` in strict packages; narrow `unknown` instead.
- Shared entity types are duplicated across a product's functions, mobile and web packages. When you change a field name, enum value or status string in one, check the others: past bugs came from `canceled` vs `cancelled`, `CUSTOM` vs `Custom`, and `onlineLink` vs `link`.
