// src/util/__tests__/forEach.test.ts
//
// Unit tests for forEach.ts.
// Exports tested:
//   - asyncForEach(list, fn) → awaits fn for each key/value pair in order

import { asyncForEach } from '../forEach';

describe('asyncForEach', () => {
  it('calls fn for each key/value pair in the record', async () => {
    const calls: Array<{ item: string; key: string }> = [];
    const list = { a: 'alpha', b: 'beta', c: 'gamma' };

    await asyncForEach(list, async (item, key) => {
      calls.push({ item, key });
    });

    expect(calls).toHaveLength(3);
    expect(calls.find(c => c.key === 'a')?.item).toBe('alpha');
    expect(calls.find(c => c.key === 'b')?.item).toBe('beta');
    expect(calls.find(c => c.key === 'c')?.item).toBe('gamma');
  });

  it('iterates in the order returned by Object.keys', async () => {
    const order: string[] = [];
    const list = { x: 1, y: 2, z: 3 };

    await asyncForEach(list, async (_item, key) => {
      order.push(key);
    });

    expect(order).toEqual(Object.keys(list));
  });

  it('awaits each async fn call before proceeding to the next', async () => {
    const sequence: number[] = [];
    const list: Record<string, number> = { first: 1, second: 2, third: 3 };

    await asyncForEach(list, async (item) => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sequence.push(item);
    });

    expect(sequence).toEqual([1, 2, 3]);
  });

  it('does not call fn when given an empty record', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    await asyncForEach({}, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('works with a single-entry record', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    await asyncForEach({ only: 42 }, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(42, 'only');
  });

  it('passes the correct item and key to fn', async () => {
    const received: Array<[number, string]> = [];
    const list: Record<string, number> = { foo: 10, bar: 20 };

    await asyncForEach(list, async (item, key) => {
      received.push([item, key]);
    });

    expect(received).toContainEqual([10, 'foo']);
    expect(received).toContainEqual([20, 'bar']);
  });

  it('propagates errors thrown by fn', async () => {
    const list = { bad: 'value' };
    const fn = jest.fn().mockRejectedValue(new Error('oops'));
    await expect(asyncForEach(list, fn)).rejects.toThrow('oops');
  });

  it('handles object values of different types', async () => {
    const items: unknown[] = [];
    const list: Record<string, unknown> = {
      num: 99,
      str: 'hello',
      bool: true,
      obj: { nested: true },
    };

    await asyncForEach(list as Record<string, unknown>, async (item) => {
      items.push(item);
    });

    expect(items).toContain(99);
    expect(items).toContain('hello');
    expect(items).toContain(true);
    expect(items).toContainEqual({ nested: true });
  });
});
