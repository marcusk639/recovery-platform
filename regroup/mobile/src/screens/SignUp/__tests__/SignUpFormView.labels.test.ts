/**
 * RatsTextInput labels an input with t(label || name), so an input with no
 * `label` prop shows its raw field name unless en.json translates it. The
 * confirm-password input showed "confirmPassword" this way (#182). Unit tests
 * mock t() as the identity, so they can't catch it; this reads the form and the
 * English strings directly.
 */
import * as fs from 'fs';
import * as path from 'path';

const formView = fs.readFileSync(path.join(__dirname, '..', 'SignUpFormView.tsx'), 'utf8');
const english: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'assets', 'i18n', 'en.json'), 'utf8'),
).en.translation;

const unlabelledTextInputs = [...formView.matchAll(/<Field\b([\s\S]*?)\/>/g)]
  .map(([, props]) => props)
  .filter((props) => /component=\{RatsTextInput\}/.test(props) && !/\blabel=/.test(props))
  .map((props) => /name="(\w+)"/.exec(props)?.[1]);

describe('SignUpFormView labels', () => {
  it('finds the form inputs it checks', () => {
    expect(unlabelledTextInputs).toEqual(
      expect.arrayContaining(['email', 'password', 'confirmPassword', 'firstName', 'lastName']),
    );
  });

  it.each(unlabelledTextInputs)('gives the %s input an English label', (name) => {
    expect(english[name as string]).toEqual(expect.any(String));
  });

  it('labels the confirm-password input "Confirm Password"', () => {
    expect(english.confirmPassword).toBe('Confirm Password');
  });
});
