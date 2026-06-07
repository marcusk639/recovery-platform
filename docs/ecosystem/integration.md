# Recovery Platform — Integration Model

> How products connect. All cross-product data flows go through recovery-api.
> Direct Firestore cross-queries are forbidden.

## recovery-api Endpoints

- `POST /api/referrals` — create a cross-app referral
- `GET /api/referrals` — list referrals (filtered by referredBy == uid)
- `GET /api/referrals/:id` — fetch a single referral by ID (ownership enforced)
- `GET /api/users/me` — fetch authenticated user profile
- `PUT /api/users/me` — update authenticated user profile

## Auth Model

- End-user requests: Firebase JWT (from the calling product's Firebase project)
- Service-to-service: `X-Service-Key` header

## Referral toApp Values

| toApp                | Product                      |
| -------------------- | ---------------------------- |
| `treatment-center`   | detox-recovery (NextStep)    |
| `phoenix-cleanhouse` | regroup (Regroup)               |
| `homegroups`         | homegroups (Homegroups) |

## Future State

recovery-api becomes the integration bus for all cross-product flows.
Cross-app user identity reconciliation will route through recovery-api.
