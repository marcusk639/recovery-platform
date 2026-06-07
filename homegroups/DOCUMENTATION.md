# Homegroups Documentation Guide

**Quick Links:**
- 🚀 **New to the project?** Start with [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)
- 💻 **Setting up locally?** Follow [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
- 🤝 **Want to contribute?** Read [`CONTRIBUTING.md`](./CONTRIBUTING.md)

---

## Documentation Structure

Homegroups documentation is organized into three tiers:

### 1. Canonical Documentation (Source of Truth)
These are the current, authoritative documents:
- [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) - MVP scope, goals, constraints
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) - Version timeline and feature prioritization
- [`README.md`](./README.md) - Application architecture and features

### 2. Supporting Documentation (Specific Topics)
Technical details and guides:
- [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md) - Security deployment checklist
- [`docs/SECURITY_RULES.md`](./docs/SECURITY_RULES.md) - Complete Firestore security rules
- [`docs/MESSAGING_ENGINEERING.md`](./docs/MESSAGING_ENGINEERING.md) - Chat system architecture
- [`docs/PRICING_MODEL.md`](./docs/PRICING_MODEL.md) - Monetization strategy
- [`docs/BILLING_AND_PAYMENTS.md`](./docs/BILLING_AND_PAYMENTS.md) - Payment system design
- See [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) for complete list

### 3. Archive (Historical Reference)
Superseded documents in [`docs/archive/`](./docs/archive/):
- Old specifications → now in PRODUCT_REQUIREMENTS.md
- Old priorities → now in ROADMAP.md
- Historical analyses → now in current technical docs
- See [`docs/archive/README.md`](./docs/archive/README.md) for details

---

## Finding What You Need

### Common Questions

| Question | Answer |
|----------|--------|
| How do I set up the project? | [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) |
| What are we building? | [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) |
| What's the roadmap? | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| How do I contribute? | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| How does [feature] work? | [`README.md`](./README.md) or [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) |
| Security rules? | [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md) |
| Can't find something? | [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) |

### By Role

**Developer:**
1. Start: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
2. Learn: [`README.md`](./README.md)
3. Understand goals: [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
4. Navigate: [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)

**Product Manager:**
1. Start: [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
2. Priorities: [`docs/ROADMAP.md`](./docs/ROADMAP.md)
3. Features: [`README.md`](./README.md)

**DevOps:**
1. Quick ref: [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md)
2. Setup: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
3. Deep dive: [`docs/SECURITY_RULES.md`](./docs/SECURITY_RULES.md)

---

## Maintaining Documentation

### When to Update Docs

- **Code changes that affect features:** Update [`README.md`](./README.md)
- **Product scope changes:** Update [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)
- **Priority shifts:** Update [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- **Security rule changes:** Update both security docs
- **New features:** Add to relevant doc + update index

### How to Keep Docs in Sync

1. Update related docs in the same PR as code changes
2. Check cross-references are still valid
3. Update version history in changed docs
4. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details

### Documentation Quality Standards

- **Clear:** Use simple language, explain jargon
- **Accurate:** Match implemented functionality
- **Complete:** Cover all aspects of the topic
- **Navigable:** Link to related docs, use headers
- **Maintained:** Update when code changes

---

## Recent Changes

### 2026-02-13: Documentation Cleanup
- Consolidated 3 meta-docs into this single guide
- Created `docs/archive/` for historical documentation
- Archived 12 superseded documents
- Updated navigation and cross-references

### 2026-02-05: Documentation Reorganization
- Created central navigation hub ([`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md))
- Created developer setup guide ([`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md))
- Created contribution guide ([`CONTRIBUTING.md`](./CONTRIBUTING.md))
- Established clear documentation hierarchy

---

## Questions or Issues?

- **Documentation unclear?** That's a bug! Create an issue or PR to fix it
- **Can't find something?** Check [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)
- **Think something should be documented?** Create an issue or PR
- **Setup problems?** See troubleshooting in [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)

---

**Version:** 2026-02-13
**Next Review:** 2026-03-13
