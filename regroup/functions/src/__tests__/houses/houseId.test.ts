import { deriveHouseId, HOUSE_ID_LENGTH } from '../../houses/houseId';

describe('deriveHouseId', () => {
  it('is deterministic for the same uid and requestKey', () => {
    expect(deriveHouseId('uid-1', 'key-1')).toBe(deriveHouseId('uid-1', 'key-1'));
  });

  it('always yields exactly 20 base62 characters', () => {
    expect(HOUSE_ID_LENGTH).toBe(20);
    for (let i = 0; i < 500; i += 1) {
      expect(deriveHouseId(`uid-${i}`, `key_${i}-x`)).toMatch(/^[A-Za-z0-9]{20}$/);
    }
  });

  it('matches a known vector (pins the derivation)', () => {
    // First 20 base62 chars of SHA-256('operator-uid:abc'). Changing the
    // derivation would orphan retries of in-flight creates; do it deliberately.
    expect(deriveHouseId('operator-uid', 'abc')).toBe('rULKFpHpMNGY0Fxc0Jhc');
  });

  it('differs by uid for the same requestKey', () => {
    expect(deriveHouseId('uid-a', 'same-key')).not.toBe(deriveHouseId('uid-b', 'same-key'));
  });

  it('differs by requestKey for the same uid', () => {
    expect(deriveHouseId('uid-a', 'key-1')).not.toBe(deriveHouseId('uid-a', 'key-2'));
  });

  it('separates uid and requestKey so the boundary cannot be shifted', () => {
    // `${uid}:${key}`: requestKey cannot contain ':' (schema), so the last ':'
    // always marks the boundary and distinct (uid, key) pairs hash distinct input.
    expect(deriveHouseId('ab', 'c')).not.toBe(deriveHouseId('a', 'bc'));
  });
});
