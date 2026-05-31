import type { Email, InviteEmailPayload } from '../Email';
import type { InvitationType } from '../Invite';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test Subject',
    text: 'Hello, this is a test email.',
    ...overrides,
  };
}

function makeInviteEmailPayload(overrides: Partial<InviteEmailPayload> = {}): InviteEmailPayload {
  return {
    email: makeEmail(),
    type: 'guest',
    dynamicLink: 'https://app.link/invite?token=abc123',
    ...overrides,
  };
}

describe('Email interface structural conformance', () => {
  it('constructs a valid Email object without errors', () => {
    expect(() => makeEmail()).not.toThrow();
  });

  it('has a from field', () => {
    const email = makeEmail({ from: 'admin@house.com' });
    expect(email.from).toBe('admin@house.com');
  });

  it('has a to field', () => {
    const email = makeEmail({ to: 'guest@example.com' });
    expect(email.to).toBe('guest@example.com');
  });

  it('has a subject field', () => {
    const email = makeEmail({ subject: 'You are invited!' });
    expect(email.subject).toBe('You are invited!');
  });

  it('has a text field', () => {
    const email = makeEmail({ text: 'Click the link to join the house.' });
    expect(email.text).toBe('Click the link to join the house.');
  });

  it('from and to can be the same address', () => {
    const email = makeEmail({ from: 'same@test.com', to: 'same@test.com' });
    expect(email.from).toBe(email.to);
  });

  it('subject can be an empty string', () => {
    const email = makeEmail({ subject: '' });
    expect(email.subject).toBe('');
  });

  it('text can be a multi-line string', () => {
    const body = 'Line 1\nLine 2\nLine 3';
    const email = makeEmail({ text: body });
    expect(email.text).toBe(body);
  });

  it('two Email objects are independent', () => {
    const e1 = makeEmail({ to: 'a@test.com' });
    const e2 = makeEmail({ to: 'b@test.com' });
    expect(e1.to).not.toBe(e2.to);
  });
});

describe('InviteEmailPayload interface structural conformance', () => {
  it('constructs a valid InviteEmailPayload without errors', () => {
    expect(() => makeInviteEmailPayload()).not.toThrow();
  });

  it('has an email field (Partial<Email>)', () => {
    const payload = makeInviteEmailPayload();
    expect(payload.email).toBeDefined();
  });

  it('email can be partial (only some fields set)', () => {
    const payload = makeInviteEmailPayload({ email: { to: 'recipient@test.com' } });
    expect(payload.email.to).toBe('recipient@test.com');
    expect(payload.email.from).toBeUndefined();
  });

  it('type is "guest"', () => {
    const payload = makeInviteEmailPayload({ type: 'guest' });
    expect(payload.type).toBe('guest');
  });

  it('type accepts "admin"', () => {
    const payload = makeInviteEmailPayload({ type: 'admin' });
    expect(payload.type).toBe('admin');
  });

  it('type accepts "superAdmin"', () => {
    const payload = makeInviteEmailPayload({ type: 'superAdmin' });
    expect(payload.type).toBe('superAdmin');
  });

  it('type accepts "supporter"', () => {
    const payload = makeInviteEmailPayload({ type: 'supporter' });
    expect(payload.type).toBe('supporter');
  });

  it('type accepts "senior-peer"', () => {
    const payload = makeInviteEmailPayload({ type: 'senior-peer' });
    expect(payload.type).toBe('senior-peer');
  });

  it('dynamicLink is a string URL', () => {
    const payload = makeInviteEmailPayload({ dynamicLink: 'https://example.com/link' });
    expect(payload.dynamicLink).toBe('https://example.com/link');
  });

  it('dynamicLink can contain query parameters', () => {
    const url = 'https://app.link/invite?houseId=h1&type=guest&token=xyz';
    const payload = makeInviteEmailPayload({ dynamicLink: url });
    expect(payload.dynamicLink).toBe(url);
  });
});
