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

import { logger } from 'firebase-functions';
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

  it('does not log the recipient or message body when sendgrid rejects', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    // Shaped like @sendgrid/mail's ResponseError: the response echoes the request.
    const sendgridError = Object.assign(new Error('Bad Request'), {
      code: 400,
      response: {
        body: { errors: [{ message: 'Invalid address: resident.name@example.com' }] },
      },
      request: { to: 'resident.name@example.com', text: 'Sensitive body' },
    });
    mockSendgridSend.mockRejectedValue(sendgridError);

    await sendEmail({ to: 'resident.name@example.com', from: regroupEmail, subject: 'Hi', text: 'Sensitive body' });

    const logged = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(logged).toContain('400');
    expect(logged).not.toContain('resident.name@example.com');
    expect(logged).not.toContain('Sensitive body');
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs a send failure at error level so a severity alert can fire', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    mockSendgridSend.mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 401 }));

    await sendEmail({ to: 'u@t.com', from: regroupEmail, subject: 'Hi', text: 'Hi' });

    // A swallowed failure is invisible unless it is logged at >= ERROR.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('keeps the diagnostic fields that distinguish one failure from another', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    // A 403 for an unverified sender and a 400 for a bad field are both
    // actionable, and a bare status code cannot tell them apart.
    const sendgridError = Object.assign(new Error('Forbidden'), {
      code: 403,
      response: {
        body: {
          errors: [
            {
              message: 'The from address does not match a verified Sender Identity: ops@regroup-app.com',
              field: 'from',
              help: 'https://sendgrid.com/docs/for-developers/sending-email/sender-identity/',
            },
          ],
        },
      },
    });
    mockSendgridSend.mockRejectedValue(sendgridError);

    await sendEmail({ to: 'u@t.com', from: regroupEmail, subject: 'Hi', text: 'Hi' });

    const payload = JSON.stringify(errorSpy.mock.calls);
    expect(payload).toContain('403');
    expect(payload).toContain('from');
    expect(payload).toContain('sender-identity');
    // `message` is the field that echoes addresses, so it must not survive.
    expect(payload).not.toContain('does not match a verified Sender Identity');
    expect(payload).not.toContain('ops@regroup-app.com');
    errorSpy.mockRestore();
  });
});
