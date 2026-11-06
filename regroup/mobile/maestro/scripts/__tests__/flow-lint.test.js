const { lintFlow } = require('../flow-lint');

const GUARD = '- runFlow: ../subflows/guard-e2e-app.yaml';
const flow = (header, body) => `# a flow\n${header}\n---\n${body}\n`;

describe('lintFlow — flows', () => {
  it('accepts a guarded flow on ${APP_ID}', () => {
    expect(lintFlow(flow('appId: ${APP_ID}', `${GUARD}\n- launchApp`))).toEqual([]);
  });

  it('refuses a flow that does not start with the guard', () => {
    expect(lintFlow(flow('appId: ${APP_ID}', '- launchApp'))).toEqual([
      expect.stringMatching(/must start with the e2e guard subflow/),
    ]);
  });

  it('refuses a hardcoded header appId even when the guard runs first', () => {
    expect(lintFlow(flow('appId: com.rats.dev', `${GUARD}\n- launchApp`))).toEqual([
      expect.stringMatching(/appId must be \$\{APP_ID\}, got "com\.rats\.dev"/),
    ]);
  });

  it('refuses a launchApp that overrides appId', () => {
    const body = `${GUARD}\n- launchApp:\n    appId: com.regroup.app\n    clearState: true`;
    expect(lintFlow(flow('appId: ${APP_ID}', body))).toEqual([
      expect.stringMatching(/appId must be \$\{APP_ID\}, got "com\.regroup\.app"/),
    ]);
  });

  it('refuses onFlowStart, which runs before the guard', () => {
    const header = 'appId: ${APP_ID}\nonFlowStart:\n  - launchApp';
    expect(lintFlow(flow(header, GUARD))).toEqual([
      expect.stringMatching(/onFlowStart runs before the guard/),
    ]);
  });

  it('ignores commented-out lines', () => {
    const text = flow(
      'appId: ${APP_ID}\n# appId: com.rats.dev',
      `${GUARD}\n# - launchApp: { appId: com.rats.dev }`,
    );
    expect(lintFlow(text)).toEqual([]);
  });
});

describe('lintFlow — subflows', () => {
  it('accepts a subflow that does not launch the app without the guard', () => {
    expect(lintFlow(flow('appId: ${APP_ID}', '- tapOn: x'), { subflow: true })).toEqual([]);
  });

  it('requires the guard in a subflow that launches the app', () => {
    expect(lintFlow(flow('appId: ${APP_ID}', '- launchApp'), { subflow: true })).toEqual([
      expect.stringMatching(/must start with the e2e guard subflow/),
    ]);
  });

  it('accepts the guard referenced from a sibling subflow', () => {
    expect(
      lintFlow(flow('appId: ${APP_ID}', '- runFlow: guard-e2e-app.yaml\n- launchApp'), {
        subflow: true,
      }),
    ).toEqual([]);
  });
});
