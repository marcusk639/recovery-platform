/**
 * The two-factor setup screen is removed until real MFA ships.
 *
 * The old screen linked a phone number to the account (signInWithPhoneNumber
 * + linkWithCredential) and then told the user "Your account is now protected
 * with two-factor authentication". Linking a phone adds a sign-in method; it
 * never asks for a second factor, so the claim was false. Owner decision
 * (2026-11-22): remove the screen for launch and build real MFA after launch
 * (Firebase Auth multi-factor enrollment; see regroup/docs/go-to-market/roadmap.md
 * RG-RM-20). These cases fail if the screen, its route or the claim comes back
 * before that work does.
 *
 * This file held the old screen's op-log cases; it is rewritten in place so the
 * test count stays put (.claude/agent-gates/verify-diff.sh).
 */
import fs from 'fs';
import path from 'path';
import { Routes } from '../../../navigation/types';

const MOBILE_ROOT = path.resolve(__dirname, '../../../..');
const SRC = path.join(MOBILE_ROOT, 'src');
const MAESTRO = path.join(MOBILE_ROOT, 'maestro');

/** Every file under dir with one of the extensions, skipping tests and mocks. */
function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      out.push(...sourceFiles(full, exts));
    } else if (
      exts.includes(path.extname(entry.name)) &&
      !/\.(test|spec)\.[jt]sx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function filesMatching(files: string[], pattern: RegExp): string[] {
  return files
    .filter((f) => pattern.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(MOBILE_ROOT, f));
}

describe('two-factor setup (removed until real MFA ships)', () => {
  it('registers no two-factor route', () => {
    expect(Object.keys(Routes)).not.toContain('TwoFactorSetup');
    expect(Object.values(Routes)).not.toContain('twoFactorSetup');
  });

  it('ships no TwoFactorSetup screen module', () => {
    expect(() => require.resolve('../TwoFactorSetup')).toThrow();
  });

  it('claims two-factor or multi-factor protection nowhere in the app', () => {
    const files = sourceFiles(SRC, ['.ts', '.tsx', '.js', '.json']);
    expect(files.length).toBeGreaterThan(100);
    expect(filesMatching(files, /two[- ]factor|\b2FA\b|multi[- ]factor|\bMFA\b/i)).toEqual([]);
  });

  it('signs in or links by phone number nowhere', () => {
    const files = sourceFiles(SRC, ['.ts', '.tsx', '.js']);
    expect(
      filesMatching(files, /signInWithPhoneNumber|PhoneAuthProvider/),
    ).toEqual([]);
  });

  it('has no Maestro flow that drives the removed screen', () => {
    const flows = sourceFiles(MAESTRO, ['.yaml', '.yml']);
    expect(flows.length).toBeGreaterThan(0);
    expect(
      filesMatching(
        flows,
        /send-code-button|verify-code-button|verification-code-input|two[- ]factor|twoFactorSetup/i,
      ),
    ).toEqual([]);
  });
});
