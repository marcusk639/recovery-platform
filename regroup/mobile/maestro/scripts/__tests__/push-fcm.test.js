const { buildMessage, assertStagingProject, assertTestEmail } = require('../push-fcm');

describe('push-fcm', () => {
  it('builds a resident push the way sendNotification does: data only, notifee JSON', () => {
    const msg = buildMessage('resident', 'tok-1', 'push-e2e-resident-1');

    expect(msg).toEqual({ token: 'tok-1', data: { notifee: expect.any(String) } });
    expect(JSON.parse(msg.data.notifee)).toEqual({
      title: 'push-e2e-resident-1',
      body: 'Device pass push check',
      data: {},
      android: { channelId: 'default' },
    });
  });

  it('builds an admin push the way sendFcmToHouseAdmins does: a notification on default', () => {
    expect(buildMessage('admin', 'tok-1', 'push-e2e-admin-1')).toEqual({
      token: 'tok-1',
      notification: { title: 'push-e2e-admin-1', body: 'Device pass push check' },
      android: { notification: { channelId: 'default' } },
    });
  });

  it('builds a data-only push with no title, body or notifee payload', () => {
    expect(buildMessage('data', 'tok-1', 'push-e2e-data-1')).toEqual({
      token: 'tok-1',
      data: { e2eProbe: 'push-e2e-data-1' },
    });
  });

  it('refuses an unknown kind', () => {
    expect(() => buildMessage('broadcast', 'tok-1', 'x')).toThrow(/kind/);
  });

  it('sends only with the staging project credentials', () => {
    expect(() => assertStagingProject({ project_id: 'regroup-e2e' })).not.toThrow();
    expect(() => assertStagingProject({ project_id: 'phoenix-cleanhouse' })).toThrow(/regroup-e2e/);
    expect(() => assertStagingProject({})).toThrow(/regroup-e2e/);
  });

  it('sends only to an e2e test account', () => {
    expect(() => assertTestEmail('e2e-op-1@rats-e2e.com')).not.toThrow();
    expect(() => assertTestEmail('someone@example.com')).toThrow(/rats-e2e/);
    expect(() => assertTestEmail('x@rats-e2e.com.evil.io')).toThrow(/rats-e2e/);
  });
});
