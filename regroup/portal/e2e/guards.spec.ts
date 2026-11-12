// The guards in helpers.ts fail a test on a request leaving this machine or an
// uncaught page error. These prove they reach past the test's own page. Each test
// checks what was caught, then clears it so the guard's own check passes.
import { expect, test } from './helpers';

const PORTAL = 'http://127.0.0.1:5199/';

test('a request from a second browser context is caught', async ({ browser, externalRequests }) => {
  const other = await browser.newPage();
  await other.goto(PORTAL);
  await other.evaluate(() => fetch('https://example.com/leak').catch(() => undefined));
  expect(externalRequests).toEqual(['example.com']);
  externalRequests.length = 0;
  await other.close();
});

test('a popup is caught', async ({ page, externalRequests }) => {
  await page.goto(PORTAL);
  const popup = page.waitForEvent('popup');
  await page.evaluate(() => window.open('https://example.com/popup'));
  await (await popup).waitForLoadState().catch(() => undefined);
  await expect.poll(() => externalRequests).toContain('example.com');
  externalRequests.length = 0;
});

test('a WebSocket leaving this machine is caught', async ({ page, externalRequests }) => {
  await page.goto(PORTAL);
  await page.evaluate(
    () => new Promise((done) => {
      const ws = new WebSocket('wss://example.com/socket');
      ws.onclose = done;
      ws.onerror = done;
    }),
  );
  expect(externalRequests).toEqual(['ws:example.com']);
  externalRequests.length = 0;
});

test('an uncaught error in another tab is caught', async ({ context, pageErrors }) => {
  const tab = await context.newPage();
  await tab.goto(PORTAL);
  await tab.evaluate(() => setTimeout(() => { throw new Error('guard probe'); }));
  await expect.poll(() => pageErrors).toEqual(['Error: guard probe']);
  pageErrors.length = 0;
});
