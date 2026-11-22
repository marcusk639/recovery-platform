// src/__tests__/util/inviteEmails.test.ts

const mockSendEmail = jest.fn();
jest.mock('../../util/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  regroupEmail: 'admin@regroup-app.com',
}));

import { sendOneInviteEmail, InviteEmailType } from '../../util/inviteEmails';

const LINK = 'https://regroup-app.com/invite?token=abc%20123';

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

  it('uses guest wording for guests and manage wording for staff roles', async () => {
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role: 'guest' });
    await sendOneInviteEmail({ toEmail: 'a@rats-e2e.com', inviteLink: LINK, role: 'admin' });
    expect(mockSendEmail.mock.calls[0][0].text).toContain('join a sober living house');
    expect(mockSendEmail.mock.calls[0][0].html).toContain('Join House');
    expect(mockSendEmail.mock.calls[1][0].text).toContain('manage a sober living house');
    expect(mockSendEmail.mock.calls[1][0].html).toContain('Accept Invitation');
  });
});
