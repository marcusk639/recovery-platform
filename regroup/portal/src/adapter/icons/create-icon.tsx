import { Text } from 'react-native-web';

const registered = new Set<string>();

export function registerFont(family: string, source: string): void {
  if (registered.has(family)) return;
  registered.add(family);
  const style = document.createElement('style');
  style.textContent = `@font-face { font-family: "${family}"; src: url("${source}") format("truetype"); }`;
  document.head.appendChild(style);
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: unknown;
  [prop: string]: unknown;
}

export function Glyph({ name, size = 12, color, style, family, glyphs, ...props }: IconProps & {
  family: string;
  glyphs: Record<string, number>;
}) {
  const code = glyphs[name];
  return (
    <Text
      {...props}
      role="img"
      aria-label={name}
      selectable={false}
      style={[{ fontFamily: family, fontSize: size, color, fontWeight: 'normal', fontStyle: 'normal' }, style]}>
      {code === undefined ? '?' : String.fromCodePoint(code)}
    </Text>
  );
}
