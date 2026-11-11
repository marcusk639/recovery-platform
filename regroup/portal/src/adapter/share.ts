// React Native's Share is navigator.share on react-native-web. Most desktop
// browsers don't have it, and where they do it opens an OS sheet rather than
// giving the operator a file, so the phone's "Export CSV" did nothing. Here
// Share always downloads the message as a file.

type ShareContent = { message?: string; title?: string; url?: string };

const looksLikeCsv = (text: string): boolean => {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return false;
  const commas = (line: string) => (line.match(/,/g) ?? []).length;
  const first = commas(lines[0]);
  return first > 0 && lines.every((line) => commas(line) === first);
};

export function fileNameFor(title: string | undefined, message: string): string {
  const trimmed = (title ?? '').trim();
  if (/\.[a-z0-9]{2,4}$/i.test(trimmed)) return trimmed;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  return `${slug}.${looksLikeCsv(message) ? 'csv' : 'txt'}`;
}

export const Share = {
  sharedAction: 'sharedAction' as const,
  dismissedAction: 'dismissedAction' as const,
  async share({ message, title, url }: ShareContent): Promise<{ action: 'sharedAction' }> {
    const text = message ?? url ?? '';
    const name = fileNameFor(title, text);
    const type = name.endsWith('.csv') ? 'text/csv' : 'text/plain';
    const href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(href);
    }
    return { action: 'sharedAction' };
  },
};
