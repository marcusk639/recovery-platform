// React Native's Share is navigator.share on react-native-web. Most desktop
// browsers don't have it, and where they do it opens an OS sheet rather than
// giving the operator a file, so the phone's "Export CSV" did nothing. Here
// Share always downloads the message as a file.

type ShareContent = { message?: string; title?: string; url?: string };
type ShareOptions = { dialogTitle?: string; subject?: string };

// Commas outside double quotes, so a quoted "Doe, Jane" is one cell.
const unquotedCommas = (line: string): number => {
  let count = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) count += 1;
  }
  return count;
};

// Every line has the same number of cells, at least two. A lone header is a
// table too: a resident with no payments exports just the header.
const looksLikeCsv = (text: string): boolean => {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return false;
  const first = unquotedCommas(lines[0]);
  return first > 0 && lines.every((line) => unquotedCommas(line) === first);
};

export function fileNameFor(title: string | undefined, message: string): string {
  const trimmed = (title ?? '').trim();
  if (/\.[a-z0-9]{2,4}$/i.test(trimmed)) return trimmed;
  const slug =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export';
  return `${slug}.${looksLikeCsv(message) ? 'csv' : 'txt'}`;
}

export const Share = {
  sharedAction: 'sharedAction' as const,
  dismissedAction: 'dismissedAction' as const,
  // Callers name the file in content.title or, like receiptService, in the
  // options' dialogTitle. Never subject: it can hold a resident's name.
  async share(
    content: ShareContent,
    options: ShareOptions = {},
  ): Promise<{ action: 'sharedAction' }> {
    if (content.message === undefined) {
      // A url-only share points at a file on the phone (GuestHome's PDF). Say
      // so through the caller's own error handling rather than download a path.
      throw new Error("Sharing a file isn't available on the web yet.");
    }
    const name = fileNameFor(content.title ?? options.dialogTitle, content.message);
    const csv = name.endsWith('.csv');
    // A byte-order mark so Excel reads the file as UTF-8 ("—", accented names).
    const text = csv ? `﻿${content.message}` : content.message;
    const href = URL.createObjectURL(
      new Blob([text], { type: `${csv ? 'text/csv' : 'text/plain'};charset=utf-8` }),
    );
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Some browsers drop a download whose object URL is revoked at once.
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
    return { action: 'sharedAction' };
  },
};
