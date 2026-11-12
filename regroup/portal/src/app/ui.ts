import type { CSSProperties } from 'react';

export const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// Pages scroll inside main, which is a flex column.
export const page: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: 24,
  background: '#f4f6f8',
  font: `14px/1.45 ${font}`,
  color: '#1d2a33',
};

export const heading: CSSProperties = { margin: '0 0 16px', fontSize: 20, fontWeight: 700 };

export const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #dde3e8',
  borderRadius: 8,
  padding: '12px 16px',
};

export const cards: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 };

export const cardLabel: CSSProperties = { fontSize: 12, color: '#5b6b77', textTransform: 'uppercase', letterSpacing: 0.4 };
export const cardValue: CSSProperties = { fontSize: 20, fontWeight: 700, marginTop: 2 };

export const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#fff',
  border: '1px solid #dde3e8',
  borderRadius: 8,
};

export const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid #dde3e8',
  fontSize: 13,
  color: '#3d4c57',
  whiteSpace: 'nowrap',
};

export const td: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #eef1f4', verticalAlign: 'top' };

export const muted: CSSProperties = { color: '#5b6b77' };
export const warning: CSSProperties = { color: '#9a5b00' };
export const danger: CSSProperties = { color: '#b3261e' };

export const link: CSSProperties = { color: '#1f5f8b', fontWeight: 600, textDecoration: 'none' };
