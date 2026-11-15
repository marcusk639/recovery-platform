import { render, screen } from '@testing-library/react';
import ionGlyphs from '@react-native-vector-icons/ionicons/glyphmaps/Ionicons.json';
import solidGlyphs from '@react-native-vector-icons/fontawesome5/glyphmaps/FontAwesome5_solid.json';
import Ionicons from '../src/adapter/icons/ionicons';
import FontAwesome5 from '../src/adapter/icons/fontawesome5';

test('an icon renders its glyph in its font', () => {
  render(<Ionicons name="home" size={20} color="red" />);
  const icon = screen.getByRole('img');
  expect(icon.textContent).toBe(String.fromCodePoint(ionGlyphs.home));
  expect(icon.style.fontFamily).toContain('Ionicons');
  expect(icon.style.fontSize).toBe('20px');
});
test('FontAwesome5 uses the font and glyphs of its iconStyle', () => {
  render(<FontAwesome5 name="cog" iconStyle="solid" />);
  const icon = screen.getByRole('img');
  expect(icon.textContent).toBe(String.fromCodePoint(solidGlyphs.cog));
  expect(icon.style.fontFamily).toContain('FontAwesomeSolid');
});
test('an unknown icon name renders a visible fallback', () => {
  render(<Ionicons name="no-such-icon" />);
  expect(screen.getByRole('img').textContent).toBe('?');
});
