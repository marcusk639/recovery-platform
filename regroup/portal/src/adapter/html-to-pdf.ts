// react-native-html-to-pdf on the web. The phone builds the compliance report as
// HTML and saves it as a PDF; here the browser's print dialog does that ("Save as
// PDF"), from the phone's own HTML, so the content matches (spec, section 7).
//
// The report's fields are untrusted input. So it runs in a sandboxed frame with
// no allow-same-origin (an opaque origin that can't reach the portal), under a
// policy that lets only this module's own print script run and loads nothing
// from the network. If the portal ever sets its own CSP, a srcdoc frame inherits
// it, and that policy must allow this script too.

type Options = { html: string; fileName: string; directory?: string };

const REMOVE_AFTER_MS = 60_000;
type PrintView = {
  frame: HTMLIFrameElement;
  timer?: ReturnType<typeof setTimeout>;
  settle: () => void;
};
let current: PrintView | null = null;

// Removing a view always settles its export, so the caller's button never stays busy.
function removeCurrent(): void {
  if (!current) return;
  const { frame, timer, settle } = current;
  current = null;
  clearTimeout(timer);
  frame.remove();
  settle();
}

function newNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const asText = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// Tags that could navigate the frame, load from the network or post a form. The
// phone's report uses none, so dropping them changes nothing it prints. DOMParser
// documents are inert: parsing runs and loads nothing.
const UNSAFE = 'meta[http-equiv], base, link, iframe, frame, object, embed, form, script';

function withoutUnsafeTags(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(UNSAFE).forEach((el) => el.remove());
  return doc.documentElement.outerHTML;
}

// The policy must come first in <head>, before anything the phone's HTML puts there.
function printDocument(html: string, fileName: string, nonce: string): string {
  const head =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}'">` +
    `<title>${asText(fileName)}</title>` +
    `<script nonce="${nonce}">addEventListener('load', function () { print(); });</script>`;
  const clean = withoutUnsafeTags(html);
  const open = /<head(\s[^>]*)?>/i.exec(clean)!;
  const at = open.index + open[0].length;
  return clean.slice(0, at) + head + clean.slice(at);
}

export function generatePDF({ html, fileName }: Options): Promise<{ filePath: string }> {
  removeCurrent();
  const frame = document.createElement('iframe');
  frame.dataset.testid = 'print-view';
  frame.title = fileName;
  frame.setAttribute('sandbox', 'allow-scripts allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  frame.setAttribute('srcdoc', printDocument(html, fileName, newNonce()));
  // The frame loads once, after its print dialog closes. A second load means it
  // navigated away from the report, so it is dropped. The tag filter above keeps
  // the report from navigating in the first place.
  let loads = 0;
  const loaded = new Promise<{ filePath: string }>((resolve) => {
    const result = { filePath: `${fileName}.pdf` };
    const view: PrintView = { frame, settle: () => resolve(result) };
    frame.addEventListener('load', () => {
      loads += 1;
      if (loads > 1) {
        if (current === view) removeCurrent();
        else frame.remove();
        return;
      }
      resolve(result);
      if (current === view) view.timer = setTimeout(removeCurrent, REMOVE_AFTER_MS);
    });
    current = view;
  });
  document.body.appendChild(frame);
  return loaded;
}

export default { generatePDF };
