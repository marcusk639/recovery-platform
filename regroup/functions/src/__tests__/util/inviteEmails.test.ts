// src/__tests__/util/inviteEmails.test.ts

const mockSendEmail = jest.fn();
jest.mock('../../util/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  regroupEmail: 'admin@regroup-app.com',
}));

import { sendOneInviteEmail, InviteEmailType } from '../../util/inviteEmails';

const LINK = 'https://regroup-app.com/invite#token=abc%20123';

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmail.mockResolvedValue(undefined);
});

describe('sendOneInviteEmail', () => {
  const roles: InviteEmailType[] = ['guest', 'admin', 'superAdmin', 'supporter'];

  it.each(roles)('sends the https link unchanged in html and text (%s)', async (role) => {
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role });
    const email = mockSendEmail.mock.calls[0][0];
    expect(email.to).toBe('a@rats-e2e.com');
    expect(email.html).toContain(`href="${LINK}"`);
    expect(email.html).toContain(`>${LINK}</a>`);
    expect(email.text).toContain(LINK);
    for (const body of [email.html, email.text]) {
      expect(body).not.toContain('com.rats.dev');
      expect(body).not.toContain('/redirect');
      expect(body).not.toContain('regroup-app://');
    }
  });

  // The token is in the link; a click-tracking redirect would carry it
  // through SendGrid.
  it.each(roles)('sends with click tracking off (%s)', async (role) => {
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role });
    expect(mockSendEmail.mock.calls[0][0].clickTracking).toBe(false);
  });

  it('uses guest wording for guests and manage wording for staff roles', async () => {
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role: 'guest' });
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role: 'admin' });
    expect(mockSendEmail.mock.calls[0][0].text).toContain('join a sober living house');
    expect(mockSendEmail.mock.calls[0][0].html).toContain('Join House');
    expect(mockSendEmail.mock.calls[1][0].text).toContain('manage a sober living house');
    expect(mockSendEmail.mock.calls[1][0].html).toContain('Accept Invitation');
  });

  it('escapes the href and anchor text in html but not the plain text', async () => {
    const link = 'https://x.example/invite?token=a&b="c"<d>';
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: link, role: 'guest' });
    const email = mockSendEmail.mock.calls[0][0];
    const esc = 'https://x.example/invite?token=a&amp;b=&quot;c&quot;&lt;d&gt;';
    expect(email.html).toContain(`href="${esc}"`);
    expect(email.html).toContain(`>${esc}</a>`);
    expect(email.html).not.toContain('"c"<d>');
    expect(email.text).toContain(link);
  });

  it('uses # for an empty link', async () => {
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: '', role: 'guest' });
    expect(mockSendEmail.mock.calls[0][0].html).toContain('href="#"');
  });
});

// M3 (2026-11-27): createInvitation needs to know the email failed.
describe('sendOneInviteEmail result', () => {
  it.each([true, false])('resolves what sendEmail resolved (%s)', async (sent) => {
    mockSendEmail.mockResolvedValueOnce(sent);
    await expect(
      sendOneInviteEmail({ toEmail: 'a@b.com', inviteLink: 'https://regroup-app.com/invite#token=T', role: 'guest' }),
    ).resolves.toBe(sent);
  });
});
