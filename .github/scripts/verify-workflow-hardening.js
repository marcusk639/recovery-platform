// Checker for verify-workflow-hardening.sh. Usage: node verify-workflow-hardening.js <workflows-dir>
const fs = require("fs");
const path = require("path");
const { parse } = require("yaml");

const dir = process.argv[2];
const load = (f) => parse(fs.readFileSync(path.join(dir, f), "utf8"));
const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};
const skipsE2eFix = (cond) =>
  typeof cond === "string" && /!\s*startsWith\(github\.head_ref,\s*'e2e-fix\/'\)/.test(cond);

const checkouts = (jobs) =>
  Object.entries(jobs).flatMap(([id, job]) =>
    (job.steps || [])
      .filter((s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"))
      .map((s) => [id, s]),
  );

// ci.yml
const ci = load("ci.yml");
check(
  ci.permissions && ci.permissions.contents === "read" && Object.keys(ci.permissions).length === 1,
  "ci.yml: top-level permissions must be exactly {contents: read}",
);
for (const [id, s] of checkouts(ci.jobs))
  check(s.with && s.with["persist-credentials"] === false, `ci.yml: ${id}: checkout needs persist-credentials: false`);
for (const id of ["maestro-smoke", "homegroups-maestro-smoke"]) {
  check(ci.jobs[id], `ci.yml: job ${id} missing`);
  if (ci.jobs[id]) check(skipsE2eFix(ci.jobs[id].if), `ci.yml: ${id}: if must exclude e2e-fix/ branches`);
}

// claude-code-review.yml
const review = load("claude-code-review.yml");
for (const [id, job] of Object.entries(review.jobs)) {
  check(skipsE2eFix(job.if), `claude-code-review.yml: ${id}: if must exclude e2e-fix/ branches`);
}
for (const [id, s] of checkouts(review.jobs))
  check(s.with && s.with["persist-credentials"] === false, `claude-code-review.yml: ${id}: checkout needs persist-credentials: false`);

// claude.yml
const claude = load("claude.yml");
for (const [id, job] of Object.entries(claude.jobs)) {
  const steps = job.steps || [];
  const first = steps[0] || {};
  check(first.id === "pr-head", `claude.yml: ${id}: first step must have id pr-head`);
  check(
    typeof first.run === "string" && /gh api/.test(first.run) && /e2e-fix\//.test(first.run),
    `claude.yml: ${id}: first step must gh api the PR head ref and test e2e-fix/`,
  );
  check(
    first.env && typeof first.env.GH_TOKEN === "string" && first.env.GH_TOKEN.includes("secrets.GITHUB_TOKEN"),
    `claude.yml: ${id}: lookup step must use GITHUB_TOKEN`,
  );
  check(
    job.permissions && job.permissions["pull-requests"] === "read",
    `claude.yml: ${id}: needs pull-requests: read`,
  );
  check(
    steps.slice(1).every((s) => typeof s.if === "string" && s.if.includes("steps.pr-head.outputs.skip")),
    `claude.yml: ${id}: every later step must be gated on steps.pr-head.outputs.skip`,
  );
  for (const [cid, s] of checkouts({ [id]: job }))
    check(s.with && s.with["persist-credentials"] === false, `claude.yml: ${cid}: checkout needs persist-credentials: false`);
}

if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS: workflow hardening properties hold");
