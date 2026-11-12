import { afterEach, vi } from 'vitest';
import { generatePDF } from '../src/adapter/html-to-pdf';

const PHONE_HTML = `
    <html>
    <head>
      <style>body { font-family: Arial; }</style>
    </head>
    <body>
      <h1>Weekly Compliance Report</h1>
      <p><strong>Resident:</strong> Test GuestA</p>
    </body>
    </html>
  `;
const BODY =
  '<h1>Weekly Compliance Report</h1>\n      <p><strong>Resident:</strong> Test GuestA</p>';
const NAME = 'compliance_guest-a_2026-11-09';

const frames = () =>
  document.querySelectorAll<HTMLIFrameElement>('iframe[data-testid="print-view"]');

// jsdom doesn't load srcdoc, so the test plays the frame's load event.
async function generate(fileName = NAME) {
  const result = generatePDF({ html: PHONE_HTML, fileName, directory: 'Documents' });
  const frame = frames()[frames().length - 1];
  frame.dispatchEvent(new Event('load'));
  return { frame, result: await result };
}

afterEach(() => document.body.replaceChildren());

test('generatePDF renders the given HTML in a sandboxed print view', async () => {
  const { frame, result } = await generate();
  expect(frames()).toHaveLength(1);
  const sandbox = frame.getAttribute('sandbox')!.split(/\s+/);
  expect(sandbox).toEqual(expect.arrayContaining(['allow-scripts', 'allow-modals']));
  expect(sandbox).not.toContain('allow-same-origin');
  const doc = frame.getAttribute('srcdoc')!;
  expect(doc).toContain(BODY);
  const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(doc)?.[1];
  expect(nonce).toBeDefined();
  expect(doc).toContain(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}'">`,
  );
  expect(doc).toContain(`<script nonce="${nonce}">`);
  expect(doc).toContain(`<title>${NAME}</title>`);
  // The policy comes before anything the phone's HTML puts in its head.
  expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'));
  expect(result).toEqual({ filePath: `${NAME}.pdf` });
});

test('each print view gets its own nonce', async () => {
  const first = (await generate()).frame.getAttribute('srcdoc')!;
  const second = (await generate()).frame.getAttribute('srcdoc')!;
  const nonceOf = (doc: string) => /nonce-([0-9a-f]+)/.exec(doc)![1];
  expect(nonceOf(first)).not.toBe(nonceOf(second));
});

test('a second call replaces the first print view', async () => {
  await generate();
  await generate('compliance_guest-b_2026-11-09');
  expect(frames()).toHaveLength(1);
  expect(frames()[0].getAttribute('srcdoc')).toContain(
    '<title>compliance_guest-b_2026-11-09</title>',
  );
});

test('a file name with markup stays text in the title', async () => {
  const { frame } = await generate('a</title><script>x()</script>');
  expect(frame.getAttribute('srcdoc')).toContain(
    '<title>a&lt;/title&gt;&lt;script&gt;x()&lt;/script&gt;</title>',
  );
});

// A frame that loads a second document has navigated away from the report.
test('a print view that navigates away is removed', async () => {
  const { frame } = await generate();
  frame.dispatchEvent(new Event('load'));
  expect(frames()).toHaveLength(0);
});

test('tags that navigate or load are dropped, and the text stays', async () => {
  const hostile = `<html><head><base href="https://example.com/"><link rel="stylesheet" href="https://example.com/a.css"></head>
    <body><p>Text: <meta http-equiv="refresh" content="0;url=https://example.com/">5</p>
    <iframe src="https://example.com/"></iframe><object data="x"></object><embed src="x"><form action="https://example.com/"><input></form></body></html>`;
  const result = generatePDF({ html: hostile, fileName: NAME });
  const frame = frames()[0];
  frame.dispatchEvent(new Event('load'));
  await result;
  const doc = frame.getAttribute('srcdoc')!;
  for (const tag of ['<base', '<link', 'http-equiv="refresh"', '<iframe', '<object', '<embed', '<form']) {
    expect(doc).not.toContain(tag);
  }
  expect(doc).toContain('Text: 5');
  expect(doc).toContain('http-equiv="Content-Security-Policy"');
});

test('a print view replaced before it loads still settles its export', async () => {
  const first = generatePDF({ html: PHONE_HTML, fileName: NAME });
  await generate('compliance_guest-b_2026-11-09');
  await expect(first).resolves.toEqual({ filePath: `${NAME}.pdf` });
});

test('the print view stays until a minute after it loads', async () => {
  vi.useFakeTimers();
  try {
    const result = generatePDF({ html: PHONE_HTML, fileName: NAME });
    vi.advanceTimersByTime(120_000);
    expect(frames()).toHaveLength(1);
    frames()[0].dispatchEvent(new Event('load'));
    await result;
    vi.advanceTimersByTime(59_000);
    expect(frames()).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(frames()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

// The print script is the only one the frame's policy runs, so it must be the only one left.
test("a script in the report's HTML is dropped, leaving only the print script", async () => {
  const hostile = `<html><head><script>steal()</script></head>
    <body><p>Text</p><script src="https://example.com/x.js"></script><svg><script>steal()</script></svg></body></html>`;
  const result = generatePDF({ html: hostile, fileName: NAME });
  const frame = frames()[0];
  frame.dispatchEvent(new Event('load'));
  await result;
  const doc = frame.getAttribute('srcdoc')!;
  const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(doc)?.[1];
  expect(doc.match(/<script\b/g)).toEqual(['<script']);
  expect(doc).toContain(`<script nonce="${nonce}">`);
  expect(doc).not.toContain('steal()');
  expect(doc).not.toContain('example.com');
});
