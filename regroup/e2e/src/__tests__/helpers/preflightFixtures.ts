import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Exec, ExecResult } from '../../preflight/checks';

export const ok = (stdout: string, stderr = ''): ExecResult => ({ code: 0, stdout, stderr });
export const notFound: ExecResult = { code: 127, stdout: '', stderr: '' };
/** An Exec answering by "cmd arg..." (or by cmd alone); anything else is not found. */
export const execFrom =
  (table: Record<string, ExecResult>): Exec =>
  async (cmd, args) =>
    table[[cmd, ...args].join(' ')] ?? table[cmd] ?? notFound;
export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
export const put = (root: string, rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
};
