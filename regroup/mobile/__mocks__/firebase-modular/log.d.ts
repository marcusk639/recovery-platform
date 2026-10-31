/** Types for the operation-log helpers in log.js (characterization tests). */
export type OpName =
  | 'get'
  | 'getDocs'
  | 'set'
  | 'update'
  | 'add'
  | 'delete'
  | 'listen'
  | 'tx.get'
  | 'tx.set'
  | 'tx.update'
  | 'tx.delete'
  | 'batch.set'
  | 'batch.update'
  | 'batch.delete'
  | 'batch.commit'
  | 'call';

export interface OpEntry {
  op: OpName;
  path: string;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  constraints?: unknown[][];
}

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds: number);
  static fromMillis(ms: number): Timestamp;
  static fromDate(date: Date): Timestamp;
  static now(): Timestamp;
  toMillis(): number;
  toDate(): Date;
  isEqual(other: Timestamp): boolean;
}

export function getOpLog(): OpEntry[];
export function resetOpLog(): void;
export function seedDoc(path: string, data: Record<string, unknown>): void;
export function seedQuery(
  collectionPath: string,
  docs: Array<{ id: string } & Record<string, unknown>>,
): void;
export function readDoc(path: string): Record<string, any> | undefined;
export function seedCall(name: string, data: unknown): void;
export function failNext(op: OpName, error: unknown, path?: string): void;
