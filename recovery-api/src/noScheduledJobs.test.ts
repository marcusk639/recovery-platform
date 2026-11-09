import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Owner decision, 2026-11-08: meeting sync runs manually through scripts, and no
 * scheduled job updates meetings, until further notice. This keeps a scheduled
 * function from coming back unnoticed. Lift it deliberately if that changes.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('recovery-api scheduled jobs', () => {
  it('declares no scheduled function anywhere in src', () => {
    const scheduled = sourceFiles(__dirname).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return /firebase-functions\/(v2\/)?scheduler|pubsub\s*\.\s*schedule/.test(source);
    });

    expect(scheduled).toEqual([]);
  });

  it('does not deploy the old refreshDirectory trigger', () => {
    const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(index).not.toMatch(/triggers\/refreshDirectory/);
  });
});
