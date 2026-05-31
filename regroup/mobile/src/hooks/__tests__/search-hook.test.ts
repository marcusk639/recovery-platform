/**
 * useSearch Hook Tests
 *
 * Tests for the simple search state hook that wraps useState
 * around a SearchState object.
 */

import { renderHook, act } from '@testing-library/react-native';
import useSearch, { SearchState } from '../search-hook';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSearch', () => {
  describe('SearchState class', () => {
    it('initializes with empty searchTerm by default', () => {
      const state = new SearchState();
      expect(state.searchTerm).toBe('');
    });
  });

  describe('initial state', () => {
    it('returns provided initial state as first element', () => {
      const initial = new SearchState();
      const { result } = renderHook(() => useSearch(initial));
      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('');
    });

    it('returns a setter function as second element', () => {
      const initial = new SearchState();
      const { result } = renderHook(() => useSearch(initial));
      const [, setSearch] = result.current as [SearchState, any];
      expect(typeof setSearch).toBe('function');
    });

    it('returns a tuple with exactly two elements', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));
      expect(result.current).toHaveLength(2);
    });
  });

  describe('state changes', () => {
    it('updates searchTerm when setter is called with new state', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: 'hello' });
      });

      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('hello');
    });

    it('handles multiple sequential state updates', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: 'first' });
      });
      expect((result.current as [SearchState, any])[0].searchTerm).toBe('first');

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: 'second' });
      });
      expect((result.current as [SearchState, any])[0].searchTerm).toBe('second');
    });

    it('can clear searchTerm back to empty string', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: 'query' });
      });

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: '' });
      });

      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('');
    });
  });

  describe('edge cases', () => {
    it('accepts custom initial SearchState with pre-filled searchTerm', () => {
      const initial: SearchState = { searchTerm: 'initial query' };
      const { result } = renderHook(() => useSearch(initial));
      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('initial query');
    });

    it('handles special characters in searchTerm', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: '!@#$%^&*()' });
      });

      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('!@#$%^&*()');
    });

    it('handles whitespace-only searchTerm', () => {
      const { result } = renderHook(() => useSearch(new SearchState()));

      act(() => {
        const [, setSearch] = result.current as [SearchState, Function];
        setSearch({ searchTerm: '   ' });
      });

      const [search] = result.current as [SearchState, any];
      expect(search.searchTerm).toBe('   ');
    });
  });
});
