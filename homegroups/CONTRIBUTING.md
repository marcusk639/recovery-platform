# Contributing to RecoveryConnect

Thank you for contributing to RecoveryConnect! This guide will help you understand how to get started, where to find information, and how to contribute effectively.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Finding Information](#finding-information)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Submitting Changes](#submitting-changes)
6. [Reporting Issues](#reporting-issues)

---

## Quick Start

### New to the Project?

Follow these steps in order:

1. **Understand what we're building**
   - Read: [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) (5 min read)
   - Read: [`README.md`](./README.md) (10 min read)

2. **Set up your development environment**
   - Follow: [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) (30-45 min)
   - This covers all platforms (mobile iOS/Android, web, backend)

3. **Understand current priorities**
   - Check: [`docs/ROADMAP.md`](./docs/ROADMAP.md) (which version are we building?)
   - Check: `docs/plans/` (what's the current sprint focused on?)

4. **Pick a task or feature**
   - Review issues labeled `good-first-issue`
   - Or pick something from current sprint in [`docs/ROADMAP.md`](./docs/ROADMAP.md)

5. **Read feature-specific docs**
   - For security features: [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md)
   - For messaging: [`docs/MESSAGING_ENGINEERING.md`](./docs/MESSAGING_ENGINEERING.md)
   - For other features: See [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)

### Experienced Contributor?

- Reference: [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) (find what you need)
- For your role: See "Documentation by Role" section in index

---

## Finding Information

### Where Do I Find...?

| Question                         | Answer                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| **How do I set up the project?** | [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)                                               |
| **What are we building?**        | [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md)                             |
| **What's next?**                 | [`docs/ROADMAP.md`](./docs/ROADMAP.md)                                                       |
| **How do security rules work?**  | [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md)                       |
| **How does messaging work?**     | [`docs/MESSAGING_ENGINEERING.md`](./docs/MESSAGING_ENGINEERING.md)                           |
| **How does feature X work?**     | [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) → Feature Documentation |
| **I need all docs organized**    | [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md)                         |

### Still Can't Find It?

Check [`docs/DOCUMENTATION-ANALYSIS.md`](./docs/DOCUMENTATION-ANALYSIS.md) for:

- Complete inventory of all documentation
- Which docs are current vs. historical
- Quality notes on each document

---

## Development Workflow

### 1. Create a Branch

Use descriptive branch names following this pattern:

```bash
# For features
git checkout -b feature/short-description

# For fixes
git checkout -b fix/short-description

# For documentation
git checkout -b docs/short-description

# Example
git checkout -b feature/transaction-editing
git checkout -b fix/sobriety-privacy-leak
git checkout -b docs/development-setup
```

### 2. Make Changes

**Code changes:**

- Follow TypeScript/JavaScript best practices
- Use existing patterns (check similar code)
- Add comments for complex logic
- Keep commits atomic (one logical change per commit)

**Documentation changes:**

- Use Markdown format
- Keep line length ~80 chars for readability
- Update related docs (cross-references)
- Check for typos and clarity

### 3. Update Related Documentation

If your change affects how something works:

- **New feature**: Document it in `/README.md` section 4 (features)
- **Database change**: Update data model in `/README.md` section 5
- **Security change**: Update [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md) and [`docs/SECURITY_RULES.md`](./docs/SECURITY_RULES.md)
- **API change**: Update [`docs/MESSAGING_ENGINEERING.md`](./docs/MESSAGING_ENGINEERING.md) or relevant doc

### 4. Test Your Changes

**For code:**

```bash
# Run tests
npm test

# For mobile
cd mobile && npm test

# For functions
cd functions && npm test
```

**For documentation:**

- Run through instructions yourself
- Check links work
- Verify code examples are correct
- Read for clarity and typos

### 5. Commit and Push

```bash
# Commit with clear message
git commit -m "feat: add transaction editing

- Users can now edit existing transactions
- Validates amount and category
- Supports multiple groups

See docs/ROADMAP.md MVP P0 section"

# Push to your branch
git push origin feature/transaction-editing
```

**Commit message guidelines:**

- Start with type: `feat:`, `fix:`, `docs:`, `refactor:`
- Clear description of what changed
- Reference related issues or docs
- Keep it concise but complete

### 6. Create Pull Request

**PR title should be clear:**

```
feat: add transaction editing

Or

fix: sobriety date privacy leak in sponsor screen
```

**PR description should include:**

```markdown
## What changed?

Clear description of the changes.

## Why?

Why is this change needed? What problem does it solve?

## Testing

How should this be tested?

## Related

- Closes #123 (if applicable)
- See docs/ROADMAP.md MVP P0
- Depends on #456

## Screenshots (if UI change)

Screenshots of before/after.
```

### 7. Code Review

- Respond to feedback promptly
- Update code and documentation as requested
- Re-request review when done
- Be kind and collaborative

### 8. Merge

Once approved:

- Squash and merge (keeps history clean)
- Delete your branch
- Update [`docs/ROADMAP.md`](./docs/ROADMAP.md) checklist if applicable

---

## Code Standards

### TypeScript/JavaScript

- **Linting**: Follow `.eslintrc` configuration
- **Formatting**: Use Prettier (check `package.json`)
- **Type safety**: Use TypeScript, avoid `any` unless necessary
- **Testing**: Write tests for business logic

Example:

```typescript
// Good: Clear, typed, documented
export const calculateSobrietyDays = (startDate: Date): number => {
  const now = new Date();
  const days = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  return days;
};

// Bad: No types, unclear
function getSobrietyDays(date) {
  return Math.floor((new Date() - date) / 86400000);
}
```

### Firestore Rules

- **Comments**: Explain non-obvious rules
- **Security**: Always ask "can bad actors exploit this?"
- **Testing**: Use Firebase emulator to test rules
- **Documentation**: Update [`docs/SECURITY_RULES_QUICKREF.md`](./docs/SECURITY_RULES_QUICKREF.md)

Example:

```rules
// Users can only read their own profile
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId;
}
```

### React/React Native Components

- **Naming**: PascalCase for components
- **Props**: Define TypeScript interface for props
- **Structure**: Keep components focused (single responsibility)
- **Accessibility**: Use accessible props (testID, accessibilityLabel)

Example:

```typescript
interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  onEdit,
  onDelete,
}) => {
  return (
    <Pressable
      testID={`transaction-${transaction.id}`}
      accessibilityLabel={`Transaction: ${transaction.description}`}
      onPress={() => onEdit(transaction.id)}
    >
      {/* Component content */}
    </Pressable>
  );
};
```

### Documentation

- **Headings**: Use H2+ (# reserved for document title)
- **Code blocks**: Always include language (`typescript, `bash, etc.)
- **Links**: Use relative paths for internal docs
- **Lists**: Use bullet or numbered consistently
- **Examples**: Show working code when possible

---

## Submitting Changes

### Before You Submit

- [ ] Code passes linting (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] Documentation is updated
- [ ] Cross-references are correct
- [ ] Changes match the relevant roadmap section
- [ ] Commit messages are clear
- [ ] No console errors/warnings

### Submission Checklist

- [ ] PR title is clear and descriptive
- [ ] PR description explains what and why
- [ ] Related issues are linked
- [ ] Screenshots included (if UI change)
- [ ] Documentation files updated
- [ ] Code follows standards above

### What Happens Next

1. **Claude Code review runs** automatically on PR submission (see `.github/workflows/claude-code-pr-review.yml`). This is the only automated step currently — there is **no CI pipeline that runs `npm test`, `npm run build`, `eslint`, or `tsc`**. Contributors are expected to run those locally before pushing. See the "Quality Standards" section above for the local commands.
2. **Code review** (1-2 reviewers)
3. **Feedback/revisions** (if needed)
4. **Approval and merge**

> **Note:** A real CI workflow (`.github/workflows/ci.yml`) is in progress as part of the audit-wave-2 hygiene branch. Once it lands, the above will be updated to describe what it actually runs.

---

## Reporting Issues

### Before Reporting

- Check existing issues (might be reported already)
- Try to reproduce the issue
- Gather relevant information

### How to Report

**Use this template:**

```markdown
## Description

Clear description of the issue.

## Steps to Reproduce

1. First step
2. Second step
3. What happens?

## Expected Behavior

What should happen instead?

## Environment

- Platform: iOS / Android / Web
- Version: v0.1.0
- Firebase: Production / Emulator

## Screenshots

If relevant, screenshots help!

## Additional Context

Any other information that might help.
```

### Issue Types

- **Bug**: Something doesn't work as expected
- **Feature Request**: New feature or improvement
- **Documentation**: Missing or unclear documentation
- **Question**: Need clarification on something

---

## Getting Help

- **Questions?** Create an issue with "question" label
- **Stuck?** Ask in PR comments or create a draft PR to discuss
- **Documentation unclear?** That's a bug! Report it.
- **General guidance?** Ping the maintainers

---

## Code of Conduct

We're building tools for recovery communities. Let's:

- **Be respectful** of everyone's time and opinions
- **Be inclusive** - recovery is for everyone
- **Be humble** - we're all learning
- **Be constructive** - feedback should help, not hurt

---

## Recognition

Contributors are recognized in:

- Commit history
- Pull request thanks
- Release notes
- (Consider a contributors list if project grows)

---

## Questions?

See [`docs/00-DOCUMENTATION-INDEX.md`](./docs/00-DOCUMENTATION-INDEX.md) for complete documentation, or ask in an issue!
