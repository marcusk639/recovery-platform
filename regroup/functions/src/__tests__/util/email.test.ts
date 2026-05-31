// src/__tests__/util/email.test.ts

const mockSendgridSend = jest.fn();
const mockSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    setApiKey: mockSetApiKey,
    send: mockSendgridSend,
  },
}));

import { sendEmail, regroupEmail } from '../../util/email';
import { Email } from '../../entities/Email';

beforeEach(() => jest.clearAllMocks());

describe('regroupEmail constant', () => {
  it('is the admin email address', () => {
    expect(regroupEmail).toBe('admin@regroup-app.com');
  });
});

describe('sendEmail', () => {
  it('calls sendgrid.send with correct to/from/subject/text', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'user@test.com', from: regroupEmail, subject: 'Hello', text: 'World' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'World',
    }));
  });

  it('uses regroupEmail as default from address when from is not provided', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    // Cast to bypass required 'from' field to test runtime fallback behaviour
    await sendEmail({ to: 'user@test.com', subject: 'Hi', text: 'Hi' } as Email);
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      from: regroupEmail,
    }));
  });

  it('uses the provided from address when supplied', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'u@t.com', from: 'custom@sender.com', subject: 'Hi', text: 'Hi' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      from: 'custom@sender.com',
    }));
  });

  it('includes html when provided', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'u@t.com', from: regroupEmail, subject: 'Hi', text: 'Hi', html: '<b>Hi</b>' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      html: '<b>Hi</b>',
    }));
  });

  it('swallows errors silently (does not throw)', async () => {
    mockSendgridSend.mockRejectedValue(new Error('SMTP error'));
    await expect(sendEmail({ to: 'u@t.com', from: regroupEmail, subject: 'Hi', text: 'Hi' }))
      .resolves.toBeUndefined();
  });
});
