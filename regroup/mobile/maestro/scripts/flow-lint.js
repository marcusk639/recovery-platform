/**
 * Static checks that keep every Maestro flow on an e2e build (launch design
 * §3.4, §4.3). The guard subflow checks the APP_ID env var, so a flow must
 * never name another app: every appId (header or launchApp override) is
 * ${APP_ID}, nothing runs before the guard (no onFlowStart), and a flow — or a
 * subflow that launches the app — starts with the guard.
 */
const GUARD_FIRST = /^- runFlow: (\.\.\/subflows\/)?guard-e2e-app\.yaml$/;

function lintFlow(text, { subflow = false } = {}) {
  const lines = String(text)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l));
  const sep = lines.findIndex((l) => l.trim() === '---');
  const header = sep < 0 ? [] : lines.slice(0, sep);
  const body = sep < 0 ? lines : lines.slice(sep + 1);
  const errs = [];

  for (const l of lines) {
    const m = l.match(/^\s*(?:-\s*)?appId:\s*(.+?)\s*$/);
    if (m && m[1] !== '${APP_ID}') {
      errs.push(`appId must be \${APP_ID}, got "${m[1]}"`);
    }
  }
  if (header.some((l) => /^onFlowStart:/.test(l))) {
    errs.push('onFlowStart runs before the guard; launch nothing outside the flow body');
  }
  const launches = body.some((l) => /launchApp/.test(l));
  if (!subflow || launches) {
    const first = body.find((l) => /^- /.test(l)) || '';
    if (!GUARD_FIRST.test(first)) {
      errs.push(
        'must start with the e2e guard subflow (- runFlow: ../subflows/guard-e2e-app.yaml)',
      );
    }
  }
  return errs;
}

module.exports = { lintFlow };
