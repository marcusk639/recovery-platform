# Claude Code PR Review Setup

This repository uses Claude Code to automatically review pull requests based on product-specific requirements and patterns.

## Setup Instructions

### 1. Add Anthropic API Key to GitHub Secrets

1. Go to your repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: Your Anthropic API key
5. Click **Add secret**

### 2. Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Under **Actions permissions**, select **Allow all actions and reusable workflows**
3. Under **Workflow permissions**, select **Read and write permissions**
4. Check **Allow GitHub Actions to create and approve pull requests**
5. Click **Save**

### 3. Verify Workflow Files

The following files should exist:
- `.github/workflows/claude-code-pr-review.yml` - GitHub Actions workflow
- `.github/PR_REVIEW_CONTEXT.md` - Product-specific review context

## How It Works

### Automatic Reviews

When a pull request is opened or updated:
1. GitHub Actions triggers the review workflow
2. Claude Code CLI is installed
3. Changed files and diff are collected
4. Claude Code reviews the PR using product context from `PR_REVIEW_CONTEXT.md`
5. Review is posted as a PR comment
6. Critical issues cause workflow to fail

### Review Criteria

Claude Code checks for:
- **Privacy patterns**: Sobriety date visibility (`!== false` pattern)
- **Stripe configuration**: Group product ID usage
- **Redux patterns**: Thunks, selectors, state management
- **Security**: Permission checks, input validation
- **Performance**: Caching, batching, query optimization
- **Type safety**: No `any` types, strict TypeScript
- **Error handling**: User-friendly messages
- **Testing**: Test IDs for E2E tests
- **Common pitfalls**: See checklist in PR_REVIEW_CONTEXT.md

### Review Output Format

```markdown
## 🔍 Code Review Summary

### ✅ Strengths
[What's done well]

### ⚠️ Issues Found
[Critical or blocking issues]

### 💡 Suggestions
[Non-blocking improvements]

### 🧪 Testing Recommendations
[What should be tested]

### ✔️ Review Checklist
[Status of checklist items]
```

## Manual Review Trigger

You can manually trigger a review by:
1. Going to **Actions** tab
2. Select **Claude Code PR Review** workflow
3. Click **Run workflow**
4. Select the branch to review

Or add a comment to the PR:
```
/review
```

## Customizing Reviews

### Update Review Context

Edit `.github/PR_REVIEW_CONTEXT.md` to:
- Add new patterns to check
- Update architecture documentation
- Add new security requirements
- Document new conventions

Changes take effect on the next PR.

### Adjust Review Strictness

Edit `.github/workflows/claude-code-pr-review.yml`:

**To make reviews more strict:**
```yaml
# Add more blocking conditions
if grep -qi "CRITICAL\|SECURITY\|PRIVACY\|TYPE_SAFETY" review-output.md; then
  exit 1
fi
```

**To change review depth:**
```yaml
# Use opus for more thorough reviews (slower, more expensive)
--model opus

# Or haiku for faster reviews (less thorough)
--model haiku
```

## Troubleshooting

### "Claude Code CLI not found"

The workflow installs Claude Code automatically. If this fails:
1. Check Node.js version (requires 18+)
2. Verify npm registry access
3. Check GitHub Actions logs for errors

### "ANTHROPIC_API_KEY not set"

1. Verify secret is added to repository
2. Check secret name matches exactly: `ANTHROPIC_API_KEY`
3. Verify workflow has permission to access secrets

### "Review not posted"

1. Check workflow permissions (need `write` for PRs)
2. Verify GitHub token has correct scopes
3. Check Actions logs for API errors

### "Review is too generic"

1. Update `PR_REVIEW_CONTEXT.md` with more specific patterns
2. Add examples of good/bad code
3. Include more product context

## Cost Management

Each review costs tokens based on:
- PR size (lines changed)
- Review depth (model used)
- Context size (product documentation)

**Estimated costs per review:**
- Small PR (<100 lines): ~$0.10 (Sonnet)
- Medium PR (100-500 lines): ~$0.30 (Sonnet)
- Large PR (500+ lines): ~$0.50+ (Sonnet)

**To reduce costs:**
1. Use Haiku model for routine reviews
2. Limit reviews to main/develop branches only
3. Skip reviews for documentation-only changes
4. Set up branch protection to require reviews

## Best Practices

### For PR Authors

1. **Add context**: Write clear PR descriptions
2. **Keep PRs focused**: Smaller PRs get better reviews
3. **Address feedback**: Respond to review comments
4. **Test first**: Don't rely solely on automated review

### For Reviewers

1. **Review alongside Claude**: Don't replace human review
2. **Validate suggestions**: Claude may miss context
3. **Update context**: Improve PR_REVIEW_CONTEXT.md based on learnings
4. **Provide examples**: Add good/bad patterns to documentation

## Integration with Code Review Process

### Recommended Flow

1. **PR opened** → Claude Code reviews automatically
2. **Author addresses** automated feedback
3. **Human reviewer** performs final review
4. **Merge** after both automated and human approval

### Branch Protection Rules

Recommended settings:
```yaml
- Require status checks to pass before merging
  - claude-code-pr-review
- Require pull request reviews before merging
  - Required approving reviews: 1
- Require conversation resolution before merging
```

## Monitoring & Analytics

View review statistics:
1. Go to **Actions** tab
2. Filter by **Claude Code PR Review** workflow
3. Check success/failure rates
4. Review average execution time

## Support

For issues with:
- **Workflow**: Check `.github/workflows/claude-code-pr-review.yml`
- **Review quality**: Update `.github/PR_REVIEW_CONTEXT.md`
- **Claude Code CLI**: See https://github.com/anthropics/claude-code
- **GitHub Actions**: See https://docs.github.com/actions

## License

This setup is part of Homegroups and follows the same license.
