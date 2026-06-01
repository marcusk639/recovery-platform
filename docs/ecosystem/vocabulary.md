# Recovery Platform — Shared Vocabulary

> Cross-product term definitions. When a term means different things in different products,
> always use the product-prefixed form (e.g., homegroups:meeting vs regroup:meeting).

## Terms

| Term          | homegroups meaning                                           | regroup meaning                                                    | Notes                                                                   |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **meeting**   | A 12-step AA/NA meeting                                      | A house staff or resident meeting                                  | Use `homegroups:meeting` or `regroup:meeting` in cross-product contexts |
| **group**     | A homegroup — an autonomous 12-step unit                     | Not a primary concept                                              |                                                                         |
| **member**    | A member of a homegroup                                      | A resident/guest in a sober living house                           |                                                                         |
| **house**     | Not used                                                     | A sober living house (primary entity)                              |                                                                         |
| **guest**     | Not used                                                     | A resident in a sober living house; Firestore collection: `guests` | Synonym: resident                                                       |
| **resident**  | Not used                                                     | Synonym for guest in regroup                                       |                                                                         |
| **homegroup** | A self-governing 12-step group                               | Not used                                                           |                                                                         |
| **referral**  | Cross-product: user referred via recovery-api /api/referrals | Same                                                               | toApp values: treatment-center, phoenix-cleanhouse, homegroups          |
