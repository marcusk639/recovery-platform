// The intake form keeps what's typed only in memory, so leaving it loses it.
import { useEffect } from 'react';
import { Routes } from '@mobile/navigation/types';
import { Alert } from '../adapter/react-native';

export const guardedRoutes = new Set<string>([Routes.ResidentIntake]);

// For the portal's own links: tabs, breadcrumb and sidebar. Browser Back isn't
// guarded, because a popstate can't be held without fighting the router.
export function confirmLeave(fromRoute: string, leave: () => void): void {
  if (!guardedRoutes.has(fromRoute)) {
    leave();
    return;
  }
  Alert.alert('Leave the intake form?', "What you've entered will be lost.", [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: leave },
  ]);
}

// A reload or closed tab gets the browser's own "leave site?" prompt.
export function useLeaveWarning(routeName: string): void {
  useEffect(() => {
    if (!guardedRoutes.has(routeName)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [routeName]);
}
