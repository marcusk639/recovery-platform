# Regroup rent charges: design

**Date:** 2026-11-08
**Status:** owner decisions recorded 2026-11-09; awaiting approval of the whole document
**Product:** Regroup (`regroup/`). Firebase project `phoenix-cleanhouse`; staging `regroup-e2e`.

## 1. Why

Today nothing adds rent to a resident's balance. `guests/{id}.rentOwed` only rises when a person types a number. Since the overpayment fix (#200), a resident whose balance hasn't been entered can't pay in the app at all, because a payment above the balance is refused. The first real house would hit this in its first week.

The house should set its rent once. Residents should then owe the right amount without anyone doing arithmetic, and a resident joining partway through a pay period should owe only for the days they're there.

There are no paying users today, only the owner's testing. Nothing here has to protect live balances, but it must be right before the first real house.

## 2. What the owner decided

- House pricing is configured in house settings.
- The manager chooses how rent is charged: weekly or monthly.
- Residents are charged according to that price unless a house manager or operator changes it for them.
- A resident joining mid-period is charged prorated rent for the days left in the first week or month.

The owner also approved these, which were proposed in conversation:

- A charge adds to the resident's balance. A card is only charged if the resident has auto-pay on.
- Weeks run Monday to Sunday in the house's timezone, matching the compliance week. Months start on the 1st.
- The move-in day counts as a day the resident pays for.
- A full period's rent is added at the start of each later period.
- A manager's change can be a custom rate for that resident going forward, or a one-off edit to their balance, which already exists.
- A new house price applies from the next period.
- Moving out mid-period doesn't refund anything automatically.

Decided by the owner after review (2026-11-09):

- **Residents already in a house when charging turns on, and residents imported later, start at the next full period, with no prorated first charge.** Their `chargeFrom` is the first day of the next period. Only residents who move in after charging is on get a prorated first charge. This avoids charging twice for days a manager already entered by hand or a resident already paid in cash.
- **Any house manager can set the house's price and schedule, a resident's custom rate, and a resident's balance. Nobody can change their own rate or balance.** That includes staff who are also residents in peer-led houses.

## 3. Goals, non-goals, anti-goals

**Goals**

- A house sets a schedule and a price once, and balances follow from then on.
- A resident owes the right amount from the day they join, and can pay that day.
- A resident and a manager can both see why a balance went up.
- A manager can set a different rate for one resident.

**Non-goals**

- Deposits, application fees and other one-off charges. `depositsAndFees` stays informational.
- Late fees.
- Automatic refunds or credits on move-out.
- Rent setup in the web operator portal. It should read the same fields when it gets there.
- Fixing auto-pay. The charge job raises balances, and the existing `scheduledRentCollection` collects them. See section 7 for what's known to be wrong there.

**Anti-goals: this has failed, even if it technically works, if:**

- A resident is charged twice for the same days, or charged for days after moving out.
- A resident is charged for months before the house turned this on.
- Dollars are treated as cents or the reverse. `house.monthlyRent` and `house.weeklyRent` are dollars, and `guest.rentOwed` is integer cents. `util/money.ts` exists because of this exact risk.
- A house that never chose a schedule starts charging anyone.
- A resident can change their own rate or schedule.

## 4. How it behaves

### 4.1 House settings

House Settings gains a Rent section: schedule (weekly or monthly) and the price for that schedule. The setup wizard offers the same choice, and its frequency picker, currently commented out, comes back.

`house.rentFrequency` today allows `'both'`, and defaults to it. `'both'` stays valid for display and means **rent charging is off**. Only `'weekly'` or `'monthly'` with a price above zero turns charging on. So every existing house, and any house that hasn't chosen, charges nobody. A house with charging off shows the manager a prompt to set it up.

Each time charging turns on, including after it was off, the house records that date (`rentChargesStartDate`, in the house's timezone). No resident is ever charged for a day before it, so days while charging was off are never charged.

### 4.2 What a resident's rate is

A resident's rate is their custom rate if a manager has set one for the house's current schedule, and the house's price otherwise. A custom rate is stored with the schedule it was set for (weekly or monthly) and applies only while the house uses that schedule, so $600/month can never become $600/week. When the house switches schedule, the manager sees which residents' custom rates no longer apply and can set them again. Zero is a valid rate (for example, a scholarship bed). Clearing it returns the resident to the house price.

A custom rate applies from the resident's next charge. It doesn't change charges already made.

### 4.3 The charge rule

Each resident has two dates, kept in a server-only record (section 4.5), not on the resident's own record:

- `chargedThrough`: the last day they've been charged for.
- `chargeFrom`: the first day they can be charged for. It's the latest of their `moveInDate`, the house's `rentChargesStartDate`, and the day they were last re-activated after a discharge.

Every charge covers from the later of the day after `chargedThrough` and `chargeFrom`, to the end of the current period. A resident who has never been charged starts at `chargeFrom`.

- **Amount:** convert the rate to cents first (`dollarsToCents`), then rate × days covered ÷ days in that period, rounded to the nearest cent. A full period is exactly the rate.
- **Weekly period:** 7 days, Monday to Sunday.
- **Monthly period:** the calendar month, using that month's real length.
- **Dates:** calendar dates in the house's timezone, never millisecond arithmetic, so daylight saving can't shift a day. `weekStartFor` in `activities/weekSummaryMath.ts` is the existing Monday rule.

This one rule covers joining mid-period, later full periods, catching up after an outage, and a schedule change.

**Examples**

| Situation                                                                  | Days covered           | Charge            |
| -------------------------------------------------------------------------- | ---------------------- | ----------------- |
| $175/week, moves in Wednesday                                              | Wed to Sun, 5 of 7     | $125.00           |
| $175/week, moves in Monday                                                 | 7 of 7                 | $175.00           |
| $800/month, moves in Nov 20                                                | Nov 20 to 30, 11 of 30 | $293.33           |
| $800/month, moves in Feb 20 of a 28-day year                               | Feb 20 to 28, 9 of 28  | $257.14           |
| $175/week, every later Monday                                              | 7 of 7                 | $175.00           |
| Weekly, charged through Sun Nov 15, switches to $800/month                 | Nov 16 to 30, 15 of 30 | $400.00 on Nov 16 |
| Monthly, charged through Nov 30, switches to $175/week, Dec 1 is a Tuesday | Dec 1 to 6, 6 of 7     | $150.00 on Dec 1  |

### 4.4 When a charge happens

- **On joining:** within a few minutes of a resident becoming active in a house with charging on, so they can see and pay their balance that day. Today's `moveInDate` is set by intake and by guest import, but not by the invite and sign-up path. A resident with none gets the date their record was created, and that value is written to `moveInDate`.
- **Every day:** a server job charges every active resident whose next chargeable day is today or earlier, using the house's local date. That covers each period start. If the job missed days, it catches up, one charge per period, oldest first.
- **Start date:** `chargeFrom`, per section 4.3. For a resident already active when charging turns on, or added by import, `chargeFrom` is the first day of the next period (section 2). A backdated move-in date on a new resident is charged back to that date, but never before charging began. A future move-in date charges nothing until that day.

Residents who are discharged, or have a `moveOutDate`, get no further charges. Use `isActiveGuestDoc` in `util/guestMembership.ts`.

### 4.5 The record of a charge

A resident's `chargedThrough` and `chargeFrom` live in a server-only document, `rentAccounts/{guestId}`, which no client can write. They must not live on `guests/{guestId}`: the app's resident edit form sends the whole record back (`screens/GuestUpdate/guestFormValues.ts`), and the guest merge lets an incoming value win for every field except balances (`mergeGuestStats` in `services/guest.tsx`). A form opened before a charge would write an older `chargedThrough` back, and the next run would charge those days again.

Each charge writes a server-only record, in a new `rentCharges` collection with a deterministic id built from the resident and the first day covered. The record, the `rentAccounts` update and the `rentOwed` increment commit in one Firestore transaction, so a retry can't double-charge. It holds the amount in cents, the days covered, the days in the period, the rate and where the rate came from (house or custom).

Residents can read their own, and house admins can read their house's. Residents see these in their history alongside payments, so a balance increase is explained. `payments` stays the history of payments only.

Each charge sets `rentDueDate` to the first day covered, but only when the resident owed nothing before the charge. Otherwise the date stays on the oldest unpaid period, so someone who never pays doesn't look freshly due every period. `overdueRentNotification`, the on-time rate and `rentRoiMetrics` already read that field, and nothing writes it today. A partly paid balance keeps the older date until it's paid off, which errs toward showing it overdue.

### 4.6 What a manager can change

- **Custom rate:** on the resident's profile, per section 4.2.
- **Balance:** the existing edit on the resident's profile stays. It's how a manager corrects a charge or gives a credit. It doesn't touch `rentAccounts` or the charge records. It sets an exact figure, so if the balance changed after the form opened (a charge or a payment landed), the form says so and asks the manager to confirm the new figure before saving.
- **Move-in date after a charge:** doesn't rewrite past charges. The manager corrects the balance by hand.

### 4.7 Access

- `rentAccounts` and `rentCharges` are written only by the server.
- Residents can't write the custom rate: add it to the sensitive fields in `firestore.rules`, next to `rentOwed` and `choreFees`, and to the self-create check.
- Any house admin may write another resident's custom rate, `rentOwed` and `choreFees`. No one may write those on their own resident record, admin or not. Today the rules let any admin edit any field of their own record except `status`, `moveOutDate` and `houseId`, so this is new. Rules tests cover a peer leader trying to lower their own balance and rate.
- Any house admin may change `monthlyRent`, `weeklyRent` and `rentFrequency`. Today the rules reserve the two prices for the super admin, so this relaxes them for those three fields only; `stripeAccountId`, `adminIds`, `ownerId` and the other financial fields stay as they are. A resident who isn't an admin still can't change any of them.
- Charges are written only by the server.

## 5. Calls made by the author of this document

The owner can overrule any of these.

- `'both'` means charging is off, rather than being retired, so existing houses change nothing.
- The `chargedThrough` and `chargeFrom` approach, so one rule covers every case in section 4.3.
- Charging continues in a house with no connected Stripe account. Those houses take cash or Zelle and record it by hand, and they still need a balance.
- Oxford houses behave like any other: nothing is charged unless they choose a schedule and a price.
- A resident gets a push notification when rent is added. Managers don't get one per charge.
- **Turning charging off and on again:** the gap is never charged (sections 4.1 and 4.3).
- **A discharged resident who is re-activated** starts again from the re-activation date (section 4.3).
- **A custom rate belongs to a schedule** (section 4.2).
- **Moving between houses:** `chargedThrough` carries over, so a resident who paid for this week in one house isn't charged again in the next until the following period.
- **A backdated discharge** dated before a charge that already ran leaves the resident charged for days after leaving. The manager corrects the balance by hand; nothing reverses automatically.
- **Turning charging on shows a preview first:** what each current resident will be charged, before the manager confirms.
- **One notification per catch-up,** not one per period.
- **A stop switch and a reversal script.** A server setting stops the charge job without a deploy, and a script reverses charges by their records (lowering `rentOwed` and restoring `chargedThrough`). Dry run by default.
- **Two records for one person:** the plan checks whether intake followed by an invite can leave two active records for one person. If it can, the plan links them, so only one is charged. A record with no account is still charged, because cash-paying residents still owe rent.
- **A lapsed Regroup subscription doesn't stop charging.** This follows the owner's earlier rule that rent is never gated on the operator's subscription.

## 6. Left to the builder

- How the job is scheduled, provided every house charges on the right local date. `WEEKLY_TRANSFER_TIMEZONES` lists only four US zones, so a house in another zone, or with an empty `timezone`, must not be silently skipped. The server's default zone is `America/New_York`.
- Whether charges on joining run from `onGuestWrite` or a separate trigger.
- Field names beyond those given here, and how the custom rate is stored, provided the unit is explicit and uses the branded money types.
- The layout of the Rent section and of charges in history.
- Index needs. Any new composite index goes in `regroup/mobile/firebase/firestore.indexes.json`.

## 7. Known problems nearby, not fixed by this

- **Auto-pay may not work at all.** No shipped path appears to set a payment method. Rising balances won't collect themselves until that's looked at.
- **A failed auto-pay ACH charge can block re-charging for up to 10 days.** The webhook's failure handler never updates `rent-collection-attempts`.
- **Payments only lower `rentOwed`,** so a paid chore fee stays on `choreFees`.

## 8. Constraints

- **Money path:** tests first, and an independent reviewer reasoning from the domain model before it merges. Mutation counts aren't a substitute.
- **Real-system proof:** the payment suite in `regroup/e2e` gets rows for proration, exactly-once under retries and concurrency, catch-up, schedule change, move-out and the unit boundary, against the emulator and the Stripe sandbox.
- **App flows:** a Maestro flow sets up rent in House Settings, adds a resident mid-period, and shows the prorated balance and a real payment of it. The check is required, not optional.
- **Docs:** the same PR updates `regroup/docs/product/requirements.md` and the "no accrual job" comments in both `util/money.ts` files.
- **Deploying:** the launch plan's production deploy freeze applies. Nothing reaches `phoenix-cleanhouse` without the owner's yes. Staging is `regroup-e2e`.
- **Upgrade:** the mobile work lands on or after the React Native upgrade (#160).
- **Privacy:** no names, contact details or balances in logs.
