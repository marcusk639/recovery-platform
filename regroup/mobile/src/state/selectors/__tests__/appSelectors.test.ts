import { selectAppUserState, selectAppNavigationState } from '../appSelectors';

const makeState = (overrides: any = {}) => ({
  user: {
    loggedIn: false,
    user: null,
    anonymous: false,
    invitation: null,
    ...overrides.user,
  },
  theme: { theme: 'light', ...overrides.theme },
});

describe('selectAppUserState', () => {
  it('returns mapped user fields', () => {
    const state = makeState({ user: { loggedIn: true, user: { uid: 'u1' } } });
    const result = selectAppUserState(state as any);
    expect(result.loggedIn).toBe(true);
    expect(result.user).toEqual({ uid: 'u1' });
  });

  it('returns same reference when state unchanged (memoization)', () => {
    const state = makeState();
    const first = selectAppUserState(state as any);
    const second = selectAppUserState(state as any);
    expect(first).toBe(second); // strict reference equality = memoized
  });

  it('returns new reference when user changes', () => {
    const stateA = makeState({ user: { loggedIn: false } });
    const stateB = makeState({ user: { loggedIn: true } });
    const resultA = selectAppUserState(stateA as any);
    const resultB = selectAppUserState(stateB as any);
    expect(resultA).not.toBe(resultB);
  });
});

describe('selectAppNavigationState', () => {
  it('returns theme', () => {
    const state = makeState({ theme: { theme: 'dark' } });
    const result = selectAppNavigationState(state as any);
    expect(result.theme).toBe('dark');
  });

  it('returns same reference when state unchanged (memoization)', () => {
    const state = makeState();
    const first = selectAppNavigationState(state as any);
    const second = selectAppNavigationState(state as any);
    expect(first).toBe(second); // strict reference equality = memoized
  });

  it('returns new reference when theme changes', () => {
    const stateA = makeState({ theme: { theme: 'light' } });
    const stateB = makeState({ theme: { theme: 'dark' } });
    const resultA = selectAppNavigationState(stateA as any);
    const resultB = selectAppNavigationState(stateB as any);
    expect(resultA).not.toBe(resultB);
  });
});
