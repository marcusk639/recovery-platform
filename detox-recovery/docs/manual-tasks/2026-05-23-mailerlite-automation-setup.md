# MailerLite Automation Setup — Lead Magnet Delivery

**Date:** 2026-05-23  
**Estimated time:** 30–45 minutes per automation (after guide content is ready)  
**Blocker:** The guide PDFs must be written before any automation can be wired end-to-end.

---

## Context

The `/api/subscribe` route adds subscribers to three MailerLite groups when someone requests a free guide. The groups exist and the API wiring is live — but MailerLite has no automations configured, so subscribers are captured and immediately receive nothing.

Three automations need to be created, one per lead magnet:

| Lead magnet                                                 | MailerLite group env var                 | Group ID             |
| ----------------------------------------------------------- | ---------------------------------------- | -------------------- |
| "What to Do When Withdrawal Starts Feeling Unsafe"          | `MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE` | `188194958591657681` |
| "How to Help Someone in Withdrawal Without Making It Worse" | `MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY` | `188194958890501182` |
| B2B lead magnet (10 Ways Detox Programs Lose Trust)         | `MAILERLITE_GROUP_ID_B2B`                | `188194959207171446` |

---

## For each lead magnet: automation setup

### 1. Create or upload the guide

The guide content must exist before this step. Two delivery options:

**Option A — File attachment in MailerLite (simplest)**  
Upload the PDF directly to MailerLite's file manager. The automation email includes it as an attachment or a download link hosted by MailerLite.

**Option B — Firebase Storage signed URL**  
Upload the PDF to a Firebase Storage bucket with public read access (or generate a long-lived signed URL). The automation email links to the URL. More flexible for future updates.

Recommended for launch: Option A (zero additional infrastructure).

---

### 2. Create the automation in MailerLite

1. Go to [app.mailerlite.com](https://app.mailerlite.com) → **Automations** → **New automation**
2. Name it to match the guide (e.g. "Unsafe withdrawal guide delivery")
3. **Trigger:** "When subscriber is added to a group" → select the matching group (see table above)
4. **Add step:** Email → write the delivery email (see template below)
5. **Activate** the automation

---

### 3. Delivery email template

Adapt for each guide. Keep it short — the value is in the PDF, not the email.

**Subject:** Your free guide is attached

**Body:**

```
Hi there,

Thanks for requesting [GUIDE TITLE].

[ATTACH PDF / LINK HERE]

A few things to know:
- This is a peer-support resource, not medical advice.
- If you or someone you love is in immediate danger, call 911 or go to the nearest ER.

Reply to this email with any questions.

— [Your name]
nextsteprecovery.com
```

---

## Newsletter group (no automation needed)

The newsletter group (`MAILERLITE_GROUP_ID_NEWSLETTER`) captures "Withdrawal Field Notes" subscribers. No automated delivery is needed here — the newsletter is sent manually or on a scheduled campaign, not via automation. Leave this group as-is until the newsletter cadence is established.

---

## Verification

After activating each automation:

1. Go to `http://localhost:3000/resources` (or the live site)
2. Enter a test email address in the lead magnet form
3. Click "Send me the guide"
4. Check that the email address appears in the correct MailerLite group
5. Check that the delivery email arrives within 1–2 minutes
6. Confirm the PDF is accessible in the email (attachment or link)

---

## Updating `docs/features.md` when complete

Once all three automations are live and verified, update `docs/features.md`:

```diff
- | Lead magnet — unsafe withdrawal guide (free) | Capture live | MailerLite group connected; email delivery of guide not wired |
+ | Lead magnet — unsafe withdrawal guide (free) | Live         | MailerLite group connected; automation delivers guide on signup |

- | Lead magnet — family guide (free)            | Capture live | MailerLite group connected; email delivery of guide not wired  |
+ | Lead magnet — family guide (free)            | Live         | MailerLite group connected; automation delivers guide on signup |

- | B2B lead magnet                              | Capture live | MailerLite group connected; email delivery not wired           |
+ | B2B lead magnet                              | Live         | MailerLite group connected; automation delivers guide on signup |
```
