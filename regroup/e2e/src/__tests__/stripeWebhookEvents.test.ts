import * as fs from 'fs';
import * as path from 'path';
import { CONNECT_EVENTS, PLATFORM_EVENTS } from '../stripeWebhooks';

// The e2e endpoints must subscribe to exactly the events the functions handle, so a
// renamed or added `case` in stripeWebhook.ts fails here instead of in staging.
const HANDLER = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'functions',
  'src',
  'webhooks',
  'stripeWebhook.ts',
);

function handledEvents(): Set<string> {
  const source = fs.readFileSync(HANDLER, 'utf8');
  const labels = [...source.matchAll(/case\s+(["'])([^"']+)\1\s*:/g)].map((m) => m[2]);
  // Event types are dotted ("invoice.payment_failed"); decline codes in the file are not.
  return new Set(labels.filter((label) => label.includes('.')));
}

describe('webhook event lists', () => {
  it('cover exactly the event types stripeWebhook.ts handles', () => {
    const handled = handledEvents();
    expect(handled.size).toBeGreaterThan(0);
    expect(new Set([...PLATFORM_EVENTS, ...CONNECT_EVENTS])).toEqual(handled);
  });

  it('send account.updated through the Connect endpoint only, as in production', () => {
    expect(PLATFORM_EVENTS).not.toContain('account.updated');
    expect(CONNECT_EVENTS).toContain('account.updated');
    expect(new Set(PLATFORM_EVENTS).size).toBe(PLATFORM_EVENTS.length);
  });
});
