# Homegroups Documentation

Welcome to the Homegroups documentation hub. This folder contains all guides, specifications, and architectural documentation for the Homegroups/Homegroups application.

**New to the project? Start here:** [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)

---

## Where to Start

### I want to...

**...understand what we're building**
→ Read [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) (5 min overview)

**...set up the project locally**
→ Follow [`DEVELOPMENT.md`](./DEVELOPMENT.md) (step-by-step guide)

**...contribute code**
→ Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md)

**...understand the architecture**
→ Check [`../README.md`](../README.md) (comprehensive features overview)

**...see what's next**
→ Review [`ROADMAP.md`](./ROADMAP.md) (priorities by version)

**...find any documentation**
→ Use [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md) (navigation hub)

**...quick guide to documentation**
→ Read [`../DOCUMENTATION.md`](../DOCUMENTATION.md) (2 min overview)

---

## Documentation by Topic

### Core Product

- [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) - MVP scope, goals, constraints
- [`ROADMAP.md`](./ROADMAP.md) - Version timeline, feature prioritization, revenue goals

### Architecture & Engineering

- [`../README.md`](../README.md) - Complete feature breakdown and architecture
- [`MESSAGING_ENGINEERING.md`](./MESSAGING_ENGINEERING.md) - Chat and messaging system
- [`deep-linking.md`](./deep-linking.md) - How deep links work for invites

### Security & Operations

- [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) - Deployment checklist, troubleshooting
- [`SECURITY_RULES.md`](./SECURITY_RULES.md) - Full Firestore security rules and rationale

### Business & Monetization

- [`PRICING_MODEL.md`](./PRICING_MODEL.md) - Pricing strategy and monetization
- [`BILLING_AND_PAYMENTS.md`](./BILLING_AND_PAYMENTS.md) - Payment system architecture

### Development

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) - Environment setup, running locally, common tasks
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) - Contribution workflow and code standards

### Reference & Analysis

- [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md) - Central navigation hub
- [`../DOCUMENTATION.md`](../DOCUMENTATION.md) - Quick guide to using docs
- [`archive/`](./archive/) - Historical/superseded documentation

### Project Plans

- [`plans/`](./plans/) - Sprint-by-sprint implementation plans

---

## Documentation by Role

**👨‍💻 Developer**

1. Start: [`DEVELOPMENT.md`](./DEVELOPMENT.md)
2. Learn: [`../README.md`](../README.md)
3. Understand goals: [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md)
4. Find info: [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)

**📊 Product Manager**

1. Start: [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md)
2. Priorities: [`ROADMAP.md`](./ROADMAP.md)
3. Features: [`../README.md`](../README.md)
4. Find info: [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)

**🛡️ DevOps / Security**

1. Quick ref: [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md)
2. Deep dive: [`SECURITY_RULES.md`](./SECURITY_RULES.md)
3. Setup: [`DEVELOPMENT.md`](./DEVELOPMENT.md)
4. Deployment checklist: See SECURITY_RULES_QUICKREF.md

**👤 Group Admin (User)**

- In-app help (built into mobile app)
- Contact support for account/group issues

---

## Key Concepts

### MVP (v0) - Launch Ready

- Essential features needed to ship
- Status: Complete — all MVP through V4 features implemented
- See: [`ROADMAP.md`](./ROADMAP.md) for full history

### Version Roadmap

- **MVP through V4**: All versions complete as of Feb 2026
- **Now**: Launch phase — getting first 30 paying groups

See [`ROADMAP.md`](./ROADMAP.md) and [`analysis-product-strategy-2026-02-23-launch.md`](./analysis-product-strategy-2026-02-23-launch.md) for current priorities.

### Revenue Model

- **Free**: Browse meetings, join groups, read announcements
- **Paid**: $12/year per group for admin features
- **Trial**: 7 days free before subscription required

See [`PRICING_MODEL.md`](./PRICING_MODEL.md) for details.

### Privacy & Anonymity

- First name / initial display by default
- User controls data sharing
- No social media integrations
- Secure, private messaging

See [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md#core-principles--constraints)

---

## Project Structure

```
docs/
├── README.md (this file)
├── 00-DOCUMENTATION-INDEX.md ← Start here for navigation
├── DEVELOPMENT.md ← Setup guide
├── CONTRIBUTING.md ← In root folder
│
├── PRODUCT_REQUIREMENTS.md ← What we build
├── ROADMAP.md ← Priorities & timeline
├── SECURITY_RULES_QUICKREF.md ← Deploy checklist
├── SECURITY_RULES.md ← Full rules
│
├── MESSAGING_ENGINEERING.md ← Chat system
├── PRICING_MODEL.md ← Revenue strategy
├── BILLING_AND_PAYMENTS.md ← Payments
├── deep-linking.md ← Deep links
│
├── DOCUMENTATION-ANALYSIS.md ← How we org docs
├── DOCUMENTATION-IMPROVEMENTS.md ← What changed
│
├── plans/ ← Sprint plans
└── [archived docs for reference]
```

---

## Using Documentation

### How to Find Something

1. **Don't know where to start?** → [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)
2. **Know what you're looking for?** → Check feature table in index
3. **Want to understand a concept?** → Check "Key Concepts" section above
4. **Looking for archived/historical?** → See [`DOCUMENTATION-ANALYSIS.md`](./DOCUMENTATION-ANALYSIS.md)

### How to Update Documentation

1. **Product/feature changes?** → Update [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md) and [`ROADMAP.md`](./ROADMAP.md)
2. **Architecture changes?** → Update [`../README.md`](../README.md)
3. **Security changes?** → Update [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) and [`SECURITY_RULES.md`](./SECURITY_RULES.md)
4. **New feature?** → Add to appropriate doc and update index if needed

When closing PRs/issues, update related documentation.

### How to Contribute

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for:

- How to set up locally
- Development workflow
- Code standards
- PR process
- Reporting issues

---

## Documentation Quality

Our documentation aims for:

- ✅ **Completeness** - All features documented
- ✅ **Accuracy** - Matches implemented functionality
- ✅ **Clarity** - Easy to understand with examples
- ✅ **Organization** - Clear navigation and hierarchy
- ✅ **Freshness** - Kept in sync with code

See [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md) for the full navigation hub.

---

## Quick Links

| Need               | Link                                                         |
| ------------------ | ------------------------------------------------------------ |
| How to set up      | [`DEVELOPMENT.md`](./DEVELOPMENT.md)                         |
| What to build      | [`PRODUCT_REQUIREMENTS.md`](./PRODUCT_REQUIREMENTS.md)       |
| Timeline           | [`ROADMAP.md`](./ROADMAP.md)                                 |
| How to contribute  | [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                   |
| Security checklist | [`SECURITY_RULES_QUICKREF.md`](./SECURITY_RULES_QUICKREF.md) |
| All docs           | [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)   |

---

## Getting Help

- **Questions about a feature?** Check the feature docs
- **Can't find documentation?** Check [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)
- **Think something should be documented?** Create an issue or PR
- **Setup issues?** Check troubleshooting in [`DEVELOPMENT.md`](./DEVELOPMENT.md)

---

## Version History

- **Last updated:** 2026-02-26
- **App version:** V4 — feature-complete, in launch phase
- **Docs reviewed:** Cleanup performed 2026-02-26 (5 deleted, 8 archived, 4 updated)
- **Archive updated:** 2026-02-26

---

**Ready to get started?** Go to [`00-DOCUMENTATION-INDEX.md`](./00-DOCUMENTATION-INDEX.md)
