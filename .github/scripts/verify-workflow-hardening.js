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

const NOT_E2E_FIX = "!startsWith(github.head_ref, 'e2e-fix/')";
const GATE = "steps.pr-head.outputs.skip != 'true'";
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

const checkouts = (jobs) =>
  Object.entries(jobs).flatMap(([id, job]) =>
    (job.steps || [])
      .filter((s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"))
      .map((s) => [id, s]),
  );
const noPersist = (file, jobs) => {
  for (const [id, s] of checkouts(jobs))
    check(s.with && s.with["persist-credentials"] === false, `${file}: ${id}: checkout needs persist-credentials: false`);
};

const files = { "ci.yml": load("ci.yml"), "claude-code-review.yml": load("claude-code-review.yml"), "claude.yml": load("claude.yml") };

// No run: step in any file may interpolate a head ref expression (script injection).
for (const [file, wf] of Object.entries(files))
  for (const [id, job] of Object.entries(wf.jobs))
    for (const s of job.steps || [])
      check(
        !(typeof s.run === "string" && /\$\{\{[^}]*head[._]ref/.test(s.run)),
        `${file}: ${id}: run: must not interpolate head ref directly (pass via env)`,
      );

// ci.yml
const ci = files["ci.yml"];
check(
  ci.permissions && ci.permissions.contents === "read" && Object.keys(ci.permissions).length === 1,
  "ci.yml: top-level permissions must be exactly {contents: read}",
);
for (const [id, job] of Object.entries(ci.jobs))
  for (const [perm, level] of Object.entries(job.permissions || {}))
    check(level === "read", `ci.yml: ${id}: permission ${perm}: ${level} must be read`);
noPersist("ci.yml", ci.jobs);
for (const id of ["maestro-smoke", "homegroups-maestro-smoke"]) {
  const job = ci.jobs[id];
  check(job, `ci.yml: job ${id} missing`);
  if (!job) continue;
  const cond = norm(job.if);
  check(
    cond === `github.event_name == 'pull_request' && ${NOT_E2E_FIX}` && !cond.includes("||"),
    `ci.yml: ${id}: if must be "github.event_name == 'pull_request' && ${NOT_E2E_FIX}" with no ||`,
  );
}
check(ci.jobs["regroup-e2e"], "ci.yml: job regroup-e2e missing");

// claude-code-review.yml
const review = files["claude-code-review.yml"];
// The if may add other skip conditions, but only as a pure && chain with the
// e2e-fix clause as one top-level conjunct: then no other conjunct can bring an
// e2e-fix/* head back in. No || anywhere, since && binds tighter than ||.
const topLevelConjuncts = (expr) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (depth === 0 && expr.startsWith("&&", i)) {
      parts.push(expr.slice(start, i).trim());
      start = i + 2;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
};
for (const [id, job] of Object.entries(review.jobs)) {
  const cond = norm(job.if).replace(/^\$\{\{\s*|\s*\}\}$/g, "");
  check(
    !cond.includes("||") && topLevelConjuncts(cond).includes(NOT_E2E_FIX),
    `claude-code-review.yml: ${id}: if must be an && chain (no ||) with ${NOT_E2E_FIX} as a top-level conjunct`,
  );
}
noPersist("claude-code-review.yml", review.jobs);

// claude.yml
const claude = files["claude.yml"];
for (const [id, job] of Object.entries(claude.jobs)) {
  const steps = job.steps || [];
  const first = steps[0] || {};
  const run = typeof first.run === "string" ? first.run : "";
  check(first.id === "pr-head", `claude.yml: ${id}: first step must have id pr-head`);
  check(/gh api/.test(run), `claude.yml: ${id}: first step must gh api the PR`);
  check(
    /e2e-fix\/\*\)\s*echo "skip=true" >> "\$GITHUB_OUTPUT"\s*;;\s*\*\)\s*echo "skip=false" >> "\$GITHUB_OUTPUT"\s*;;/.test(run),
    `claude.yml: ${id}: case must map e2e-fix/* to skip=true and everything else to skip=false`,
  );
  check(!run.includes("||"), `claude.yml: ${id}: lookup step must not use || (fail-closed)`);
  check(!/set \+e/.test(run), `claude.yml: ${id}: lookup step must not disable errexit`);
  check(
    !first.shell || /^bash\b/.test(first.shell),
    `claude.yml: ${id}: lookup step shell must be default bash`,
  );
  check(!("continue-on-error" in first), `claude.yml: ${id}: lookup step must not set continue-on-error`);
  check(
    first.env && typeof first.env.GH_TOKEN === "string" && first.env.GH_TOKEN.includes("secrets.GH_TOKEN"),
    `claude.yml: ${id}: lookup step must use GH_TOKEN`,
  );
  check(job.permissions && job.permissions["pull-requests"] === "read", `claude.yml: ${id}: needs pull-requests: read`);
  steps.slice(1).forEach((s, i) =>
    check(
      typeof s.if === "string" && norm(s.if) === GATE,
      `claude.yml: ${id}: step ${i + 2} (${s.name || s.uses}): if must be exactly ${GATE}`,
    ),
  );
  noPersist("claude.yml", { [id]: job });
}

if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS: workflow hardening properties hold");
