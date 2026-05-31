# Legal Docs Hosting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Regroup Privacy Policy and Terms of Service to live HTTPS URLs on regroup-app.com by replacing placeholder content in the existing rats-web Angular components.

**Architecture:** rats-web already has `/privacy-policy` and `/terms` routes wired to Angular components that load content from TypeScript data files (`privacy-policy.ts`, `terms.ts`). The task is to write a conversion script that reads `docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_SERVICE.md` from rats-v2, converts them to HTML, and writes them into those data files. Then deploy rats-web.

**Tech Stack:** Node.js 18, `marked` (markdown→HTML), Angular 13 (rats-web), Firebase Hosting

> **⚠️ IMPORTANT:** Complete `P0-D` (HIPAA legal decision) before running this plan. If the HIPAA consult requires adding a BAA section to the Privacy Policy, update `docs/PRIVACY_POLICY.md` in rats-v2 first, then run this plan.

---

## File Structure

| Action | Path                                                                            | Responsibility                                                           |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Create | `scripts/update-legal-docs.js`                                                  | Read markdown from rats-v2, convert to HTML, write to rats-web .ts files |
| Modify | `../rats-web/src/app/components/privacypolicy/privacy-policy/privacy-policy.ts` | Privacy Policy HTML content                                              |
| Modify | `../rats-web/src/app/components/terms/privacy-policy/terms.ts`                  | Terms of Service HTML content                                            |

---

## Task 1: Write the Markdown-to-HTML Conversion Script

**Files:**

- Create: `scripts/update-legal-docs.js`

- [ ] **Step 1: Install `marked` in the scripts directory**

```bash
cd /Users/marcusklein/dev/rats-v2/scripts
npm install marked
```

Expected: `marked` appears in `scripts/node_modules/`.

- [ ] **Step 2: Write the conversion script**

Create `scripts/update-legal-docs.js`:

```js
#!/usr/bin/env node
/**
 * Converts docs/PRIVACY_POLICY.md and docs/TERMS_OF_SERVICE.md to HTML
 * and writes them into the rats-web Angular component data files.
 *
 * Usage (run from rats-v2 root):
 *   node scripts/update-legal-docs.js
 *
 * Prerequisites:
 *   cd scripts && npm install marked
 */

const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const RATS_V2_ROOT = path.resolve(__dirname, '..');
const RATS_WEB_ROOT = path.resolve(__dirname, '../../rats-web');

const SOURCES = [
  {
    markdown: path.join(RATS_V2_ROOT, 'docs', 'PRIVACY_POLICY.md'),
    output: path.join(
      RATS_WEB_ROOT,
      'src/app/components/privacypolicy/privacy-policy/privacy-policy.ts',
    ),
    label: 'Privacy Policy',
  },
  {
    markdown: path.join(RATS_V2_ROOT, 'docs', 'TERMS_OF_SERVICE.md'),
    output: path.join(
      RATS_WEB_ROOT,
      'src/app/components/terms/privacy-policy/terms.ts',
    ),
    label: 'Terms of Service',
  },
];

function markdownToHtml(md) {
  return marked.parse(md, { mangle: false, headerIds: false });
}

function wrapHtml(html) {
  return `<style>
  .legal-doc { max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #333; }
  .legal-doc h1 { font-size: 28px; margin-bottom: 8px; }
  .legal-doc h2 { font-size: 20px; margin-top: 32px; margin-bottom: 8px; }
  .legal-doc h3 { font-size: 16px; margin-top: 24px; }
  .legal-doc p { margin-bottom: 12px; }
  .legal-doc ul, .legal-doc ol { padding-left: 24px; margin-bottom: 12px; }
  .legal-doc li { margin-bottom: 6px; }
  .legal-doc strong { font-weight: 600; }
  .legal-doc a { color: #4a90e2; }
</style>
<div class="legal-doc">
${html}
</div>`;
}

for (const { markdown, output, label } of SOURCES) {
  if (!fs.existsSync(markdown)) {
    console.error(`ERROR: Source file not found: ${markdown}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.dirname(output))) {
    console.error(`ERROR: Output directory not found: ${path.dirname(output)}`);
    console.error(`Is rats-web checked out at ${RATS_WEB_ROOT}?`);
    process.exit(1);
  }

  const md = fs.readFileSync(markdown, 'utf8');
  const html = wrapHtml(markdownToHtml(md));

  // Escape backticks and backslashes for the TypeScript template literal
  const escaped = html
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

  const tsContent = `export default \`\n${escaped}\n\`;\n`;

  fs.writeFileSync(output, tsContent, 'utf8');
  console.log(`✓ ${label} written to ${path.relative(process.cwd(), output)}`);
}

console.log('\nDone. Deploy rats-web to publish the updated pages.');
```

- [ ] **Step 3: Run the script**

```bash
cd /Users/marcusklein/dev/rats-v2
node scripts/update-legal-docs.js
```

Expected:

```
✓ Privacy Policy written to ../rats-web/src/app/components/privacypolicy/privacy-policy/privacy-policy.ts
✓ Terms of Service written to ../rats-web/src/app/components/terms/privacy-policy/terms.ts

Done. Deploy rats-web to publish the updated pages.
```

- [ ] **Step 4: Verify the output files look correct**

```bash
head -20 /Users/marcusklein/dev/rats-web/src/app/components/privacypolicy/privacy-policy/privacy-policy.ts
```

Expected: file starts with ` export default \`` followed by  `<style>`and`<div class="legal-doc">` containing HTML from the markdown.

```bash
# Confirm it ends properly (no unclosed backtick)
tail -3 /Users/marcusklein/dev/rats-web/src/app/components/privacypolicy/privacy-policy/privacy-policy.ts
```

Expected: last line is `` `; ``

- [ ] **Step 5: Build rats-web locally to confirm no errors**

```bash
cd /Users/marcusklein/dev/rats-web
npm run build:prod 2>&1 | tail -20
```

Expected: build completes with no errors. Warnings about `LegacyProvider` are pre-existing and can be ignored.

- [ ] **Step 6: Commit the script and updated data files**

```bash
# Commit the conversion script to rats-v2
cd /Users/marcusklein/dev/rats-v2
git add scripts/update-legal-docs.js
git commit -m "chore(scripts): add markdown-to-html converter for legal docs"

# Commit the updated data files to rats-web
cd /Users/marcusklein/dev/rats-web
git add src/app/components/privacypolicy/privacy-policy/privacy-policy.ts \
        src/app/components/terms/privacy-policy/terms.ts
git commit -m "docs(legal): update Privacy Policy and Terms of Service content"
```

---

## Task 2: Deploy rats-web

- [ ] **Step 1: Deploy to Firebase Hosting**

```bash
cd /Users/marcusklein/dev/rats-web
npm run build:deploy
```

This runs `ng build --prod`, builds Cloud Functions, and runs `firebase deploy`.

Expected output ends with:

```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/phoenix-cleanhouse/overview
Hosting URL: https://phoenix-cleanhouse.web.app
```

- [ ] **Step 2: Verify the live URLs**

Open in an incognito browser window:

```
https://regroup-app.com/privacy-policy
https://regroup-app.com/terms
```

**Check:**

- Page loads with readable Regroup content (not Lorem Ipsum, not the old Cleanhouse placeholder)
- "Last updated: May 21, 2026" appears in the content
- Both URLs return HTTP 200 (test with `curl -s -o /dev/null -w "%{http_code}" https://regroup-app.com/privacy-policy`)

**Expected result:** Both URLs return 200 with the Regroup Privacy Policy and Terms of Service content.

- [ ] **Step 3: Copy the URLs**

These are what you'll paste into App Store Connect and Play Console:

- **Privacy Policy URL:** `https://regroup-app.com/privacy-policy`
- **Terms URL:** `https://regroup-app.com/terms`

---

## Manual Step: P0-D — HIPAA Decision (Cannot Be Automated)

> This must be completed BEFORE running this plan if the HIPAA decision might add new content to the Privacy Policy.

Share the following data inventory with a healthcare attorney and ask: _"Does operating a sober living house management platform that stores this data require a BAA with Google Cloud and Stripe?"_

**Data Regroup stores:**

- Sobriety date
- Medication notes (free text field in guest profile)
- Meeting attendance records
- EES / drug test history (if drug testing module is enabled)
- Payment history

**Possible outcomes:**

| Outcome          | Action before running this plan                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| BAA not required | Run this plan as-is                                                                                                                  |
| BAA required     | Add a "Business Associate Agreement" section to `docs/PRIVACY_POLICY.md`, sign BAAs with Google Cloud and Stripe, then run this plan |
| Uncertain        | Do not publish policy until clarified                                                                                                |

---

## Self-Review

### Spec Coverage

| Requirement                                | Covered by                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Privacy Policy at stable HTTPS URL         | Task 2 — deployed to `regroup-app.com/privacy-policy`                       |
| Terms of Service at stable HTTPS URL       | Task 2 — deployed to `regroup-app.com/terms`                                |
| Content from the written docs              | Task 1 — script reads `docs/PRIVACY_POLICY.md` + `docs/TERMS_OF_SERVICE.md` |
| Accessible without login (incognito check) | Task 2 Step 2                                                               |

### Acceptance Criteria

- [ ] `curl -s -o /dev/null -w "%{http_code}" https://regroup-app.com/privacy-policy` returns `200`
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://regroup-app.com/terms` returns `200`
- [ ] Page content includes "Regroup" and "Last updated: May 21, 2026"
- [ ] Content is readable without logging in (test in incognito)
