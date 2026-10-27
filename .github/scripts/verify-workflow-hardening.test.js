// Mutation self-test for verify-workflow-hardening.js.
// Usage: node verify-workflow-hardening.test.js   (needs `yaml` on NODE_PATH)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const real = path.resolve(__dirname, "../workflows");
const checker = path.join(__dirname, "verify-workflow-hardening.js");

const run = (dir) => spawnSync(process.execPath, [checker, dir], { encoding: "utf8" });

// Each mutation: [name, file, from, to]. `from` must occur in the real file.
const GATE = "steps.pr-head.outputs.skip != 'true'";
const mutations = [
  ["ci: top-level permissions write", "ci.yml", "permissions:\n  contents: read\n", "permissions:\n  contents: write\n"],
  ["ci: removed persist-credentials", "ci.yml", "          persist-credentials: false\n", ""],
  ["ci: removed maestro e2e-fix clause", "ci.yml", " && !startsWith(github.head_ref, 'e2e-fix/')", ""],
  ["ci: maestro && -> ||", "ci.yml", "'pull_request' && !startsWith", "'pull_request' || !startsWith"],
  ["ci: job-level contents: write", "ci.yml", "  recovery-api:\n    name: recovery-api — typecheck + test\n", "  recovery-api:\n    permissions:\n      contents: write\n    name: recovery-api — typecheck + test\n"],
  ["review: removed job if", "claude-code-review.yml", /^    if: >-\n(?: {6}.*\n)+/m, ""],
  ["review: removed e2e-fix clause", "claude-code-review.yml", "      && !startsWith(github.head_ref, 'e2e-fix/')\n", ""],
  ["review: e2e-fix clause && -> ||", "claude-code-review.yml", "&& !startsWith(github.head_ref, 'e2e-fix/')", "|| !startsWith(github.head_ref, 'e2e-fix/')"],
  ["review: e2e-fix clause negation dropped", "claude-code-review.yml", "!startsWith(github.head_ref, 'e2e-fix/')", "startsWith(github.head_ref, 'e2e-fix/')"],
  ["review: e2e-fix clause inside negated group", "claude-code-review.yml", "${{ !github.event.pull_request.draft\n      && !startsWith(github.head_ref, 'e2e-fix/')", "${{ !(!github.event.pull_request.draft\n      && !startsWith(github.head_ref, 'e2e-fix/'))"],
  ["review: || on another conjunct", "claude-code-review.yml", "&& github.actor != 'dependabot[bot]'", "|| github.actor != 'dependabot[bot]'"],
  ["review: removed persist-credentials", "claude-code-review.yml", "          persist-credentials: false\n", ""],
  ["claude: case pattern changed", "claude.yml", "e2e-fix/*) echo", "e2e-fix-x/*) echo"],
  ["claude: gate inverted", "claude.yml", `if: ${GATE}`, "if: steps.pr-head.outputs.skip == 'true'"],
  ["claude: gate always() ||", "claude.yml", `if: ${GATE}`, `if: always() || ${GATE}`],
  ["claude: gh api || true", "claude.yml", "--jq '.head.ref')", "--jq '.head.ref' || true)"],
  ["claude: pr-head continue-on-error", "claude.yml", "        id: pr-head\n", "        id: pr-head\n        continue-on-error: true\n"],
  ["claude: head ref interpolated into run", "claude.yml", 'head_ref="$REVIEW_HEAD_REF"', 'head_ref="${{ github.event.pull_request.head.ref }}"'],
  ["claude: removed step gate", "claude.yml", `        if: ${GATE}\n        id: claude`, "        id: claude"],
  ["claude: removed persist-credentials", "claude.yml", "          persist-credentials: false\n", ""],
  ["claude: removed pull-requests: read", "claude.yml", "      pull-requests: read\n", ""],
];

let bad = 0;
const base = run(real);
if (base.status !== 0) {
  bad++;
  console.error(`FAIL: checker does not pass on real workflows\n${base.stderr}`);
}

for (const [name, file, from, to] of mutations) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wf-mut-"));
  for (const f of fs.readdirSync(real)) fs.copyFileSync(path.join(real, f), path.join(tmp, f));
  const p = path.join(tmp, file);
  const src = fs.readFileSync(p, "utf8");
  if (!(from instanceof RegExp ? from.test(src) : src.includes(from))) {
    bad++;
    console.error(`FAIL: mutation "${name}" does not apply (pattern not found in ${file})`);
    continue;
  }
  // replaceAll for persist-credentials-style removals would be too broad only if
  // it leaves the checker satisfied elsewhere; one occurrence is enough to catch.
  fs.writeFileSync(p, src.replace(from, () => to));
  const r = run(tmp);
  if (r.status === 0) {
    bad++;
    console.error(`FAIL: mutation survived: ${name}`);
  } else console.log(`ok   killed: ${name}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (bad) {
  console.error(`${bad} problem(s)`);
  process.exit(1);
}
console.log(`PASS: real files pass; ${mutations.length}/${mutations.length} mutations killed`);
