import type { ReactNode } from 'react';

export const noticeStyle = {
  margin: 'auto',
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  font: '15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export function Notice({ title, testId, children }: { title: string; testId?: string; children?: ReactNode }) {
  return (
    <div data-testid={testId} style={noticeStyle}>
      <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{title}</h1>
      {children}
    </div>
  );
}
