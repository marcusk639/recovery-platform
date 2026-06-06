> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# RecoveryConnect Documentation Quick Reference

Quick lookup for common questions. Bookmark this file!

---

## I Need to...

### Get Started / Setup

| Task | Document | Time |
|------|----------|------|
| Set up project locally | [`DEVELOPMENT.md`](./DEVELOPMENT.md) | 30-45 min |
| Understand the project | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) | 5 min |
| See what's next | [`ROADMAP.md`](./ROADMAP.md) | 10 min |
| Find specific info | [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md) | 2 min |

### Development / Coding

| Task | Document | Info |
|------|----------|------|
| Learn the codebase | [`../README.md`](../README.md) | Architecture & features |
| Add a new feature | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Workflow & standards |
| Understand messaging | [`MESSAGING_ENGINEERING.md`](./MESSAGING_ENGINEERING.md) | Chat system |
| Fix a bug | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Steps 1-7 |

### Security / Deployment

| Task | Document | Info |
|------|----------|------|
| Deploy security rules | [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) | Checklist & steps |
| Understand Firestore rules | [`SECURITY_RULES.md`](./SECURITY_RULES.md) | Full rule set |
| Debug permission errors | [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md#common-permission-errors) | Troubleshooting table |
| Check access control | [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md#access-control-summary) | Who can access what |

### Product / Strategy

| Task | Document | Info |
|------|----------|------|
| Understand MVP scope | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) | Goals & constraints |
| See full roadmap | [`ROADMAP.md`](./ROADMAP.md) | MVP, V1, V2, V3, V4 |
| Understand pricing | [`PRICING_MODEL.md`](./PRICING_MODEL.md) | Revenue strategy |
| Learn about payments | [`BILLING_AND_PAYMENTS.md`](./BILLING_AND_PAYMENTS.md) | Payment system |

### Contributing / Workflows

| Task | Document | Info |
|------|----------|------|
| Learn how to contribute | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Complete guide |
| Understand code standards | [`../CONTRIBUTING.md`](../CONTRIBUTING.md#code-standards) | Examples included |
| Submit a change | [`../CONTRIBUTING.md`](../CONTRIBUTING.md#submitting-changes) | Checklist |
| Report an issue | [`../CONTRIBUTING.md`](../CONTRIBUTING.md#reporting-issues) | Template |

---

## By Role

### 👨‍💻 Developer

**Start here:**
```
1. DEVELOPMENT.md (setup)
2. README.md (understand architecture)
3. PRODUCT_REQUIREMENTS.md (understand goals)
4. 00-DOCUMENTATION-INDEX.md (find anything else)
```

**Key docs:**
- `DEVELOPMENT.md` - Setup and local development
- `../README.md` - Complete architecture
- `CONTRIBUTING.md` - How to submit code
- `SECURITY_RULES_QUICKREF.md` - Security reference
- `MESSAGING_ENGINEERING.md` - Chat system

### 📊 Product Manager

**Start here:**
```
1. PRODUCT_REQUIREMENTS.md (what we're building)
2. ROADMAP.md (timeline and priorities)
3. README.md (understand features)
4. 00-DOCUMENTATION-INDEX.md (find more)
```

**Key docs:**
- `PRODUCT_REQUIREMENTS.md` - MVP scope
- `ROADMAP.md` - Full roadmap
- `PRICING_MODEL.md` - Revenue model
- `../README.md` - Feature details

### 🛡️ DevOps / Operations

**Start here:**
```
1. SECURITY_RULES_QUICKREF.md (deployment)
2. DEVELOPMENT.md (local setup for testing)
3. SECURITY_RULES.md (full rules reference)
```

**Key docs:**
- `SECURITY_RULES_QUICKREF.md` - Deployment checklist
- `SECURITY_RULES.md` - All rules
- `DEVELOPMENT.md` - Local emulators
- `BILLING_AND_PAYMENTS.md` - Payment system

### 👤 New Contributor

**Start here:**
```
1. CONTRIBUTING.md (how to contribute)
2. DEVELOPMENT.md (setup project)
3. PRODUCT_REQUIREMENTS.md (understand goals)
4. README.md (understand architecture)
```

**Key docs:**
- `CONTRIBUTING.md` - Everything about contributing
- `DEVELOPMENT.md` - Setup guide
- `../README.md` - Architecture
- `ROADMAP.md` - See what's next

---

## Common Questions

### "How do I run the app locally?"
→ [`DEVELOPMENT.md`](./DEVELOPMENT.md)

### "What are we building?"
→ [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md)

### "What's the next priority?"
→ [`ROADMAP.md`](./ROADMAP.md)

### "How does feature X work?"
→ [`../README.md`](../README.md) section 4 (features)

### "How do I submit code?"
→ [`../CONTRIBUTING.md`](../CONTRIBUTING.md#development-workflow)

### "What are the security rules?"
→ [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) (quick) or [`SECURITY_RULES.md`](./SECURITY_RULES.md) (full)

### "How does the messaging system work?"
→ [`MESSAGING_ENGINEERING.md`](./MESSAGING_ENGINEERING.md)

### "How do I deploy?"
→ [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md#deployment-checklist)

### "I'm stuck on setup, what do I do?"
→ [`DEVELOPMENT.md#troubleshooting`](./DEVELOPMENT.md#troubleshooting)

### "What's the revenue model?"
→ [`PRICING_MODEL.md`](./PRICING_MODEL.md)

### "I need to understand the payment system"
→ [`BILLING_AND_PAYMENTS.md`](./BILLING_AND_PAYMENTS.md)

### "I can't find a document"
→ [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)

---

## Documentation Map

```
START HERE ↓

                    00-DOCUMENTATION-INDEX.md
                           ↓
                (Central navigation hub)
                           ↓
            ┌───────────────┼───────────────┐
            ↓               ↓               ↓
        Developer       Product Mgr      DevOps
            ↓               ↓               ↓
      DEVELOPMENT.md  PRODUCT_REQS.md  SECURITY_RULES*.md
      README.md       ROADMAP.md       DEVELOPMENT.md
      CONTRIBUTING.md PRICING_MODEL.md
```

---

## File Locations

### In `/docs/`:
- `00-DOCUMENTATION-INDEX.md` - Central index (start here!)
- `DEVELOPMENT.md` - Setup guide
- `README.md` - Docs entry point
- `PRODUCT_REQUIREMENTS.md` - What we build
- `ROADMAP.md` - Priorities & timeline
- `SECURITY_RULES_QUICKREF.md` - Deploy checklist
- `SECURITY_RULES.md` - Full rules
- `MESSAGING_ENGINEERING.md` - Chat system
- `PRICING_MODEL.md` - Revenue model
- `BILLING_AND_PAYMENTS.md` - Payments
- `deep-linking.md` - Deep links
- `DOCUMENTATION-ANALYSIS.md` - How we organize
- `DOCUMENTATION-IMPROVEMENTS.md` - What changed
- `plans/` - Sprint plans

### In root:
- `README.md` - Architecture & features overview
- `CONTRIBUTING.md` - How to contribute
- `DOCUMENTATION-SUMMARY.md` - Executive summary

---

## Key Concepts

| Concept | Where to Learn | Info |
|---------|----------------|------|
| MVP (v0) | [`ROADMAP.md#mvp`](./ROADMAP.md#mvp-v0---launch-ready) | Launch-ready features |
| V1 | [`ROADMAP.md#v1`](./ROADMAP.md#v1---admin-value--engagement) | Admin value & engagement |
| Revenue Model | [`PRICING_MODEL.md`](./PRICING_MODEL.md) | $12/year per group |
| Privacy | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md#core-principles--constraints) | First name/initial only |
| Groups | [`../README.md`](../README.md#43-group-management--membership) | Group features |
| Treasury | [`../README.md`](../README.md#45-treasury-management) | Financial tracking |
| Messaging | [`MESSAGING_ENGINEERING.md`](./MESSAGING_ENGINEERING.md) | Chat system |
| Security | [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) | Access control |

---

## Pro Tips

1. **Bookmark this file** - Easy reference for future
2. **Bookmark 00-DOCUMENTATION-INDEX.md** - Central hub
3. **When you update code, update docs** - Keep them in sync
4. **Use Ctrl/Cmd+F to search docs** - Most are Markdown
5. **Check table of contents in long docs** - Faster navigation
6. **If docs are confusing, that's a bug!** - Report it or fix it

---

## Last Updated

- **Date:** 2026-02-05
- **Status:** Current and ready to use
- **Next review:** 2026-03-05

---

## Still Need Help?

1. Check `00-DOCUMENTATION-INDEX.md` for full navigation
2. Search this Quick Reference
3. Read relevant feature section in `../README.md`
4. Check troubleshooting sections in relevant docs
5. Create an issue asking for documentation

**Most questions are already answered somewhere in the docs!**
