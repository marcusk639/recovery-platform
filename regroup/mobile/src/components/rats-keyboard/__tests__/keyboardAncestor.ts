/**
 * Test helper (plan Task 15): the nearest keyboard-handling ancestor of a
 * rendered node, i.e. what keeps a field above the keyboard now that
 * IQKeyboardManager and Android's adjustResize are gone.
 */
import type { ReactTestInstance } from 'react-test-renderer';
import RatsScrollView from '../../rats-scroll-view';
import { RatsKeyboardAvoidingView } from '../index';

export type KeyboardAncestor = 'RatsScrollView' | 'RatsKeyboardAvoidingView' | null;

export function keyboardAncestor(node: ReactTestInstance): KeyboardAncestor {
  let current: ReactTestInstance | null = node.parent;
  while (current) {
    if (current.type === RatsScrollView) {
      return 'RatsScrollView';
    }
    if (current.type === RatsKeyboardAvoidingView) {
      return 'RatsKeyboardAvoidingView';
    }
    current = current.parent;
  }
  return null;
}
