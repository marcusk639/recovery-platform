// The intake form keeps what's typed only in memory, so leaving it loses it.
import { useEffect } from 'react';
import { Routes } from '@mobile/navigation/types';
import { lastClosedAlert } from '../adapter/alert/alert-store';
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

// A sign-out reloads the page to wipe it, and must never stop at the prompt:
// that would leave the form on an unattended screen.
let released = false;
export function releaseLeaveWarning(): void {
  released = true;
}

// A reload or closed tab gets the browser's own "leave site?" prompt.
export function useLeaveWarning(routeName: string): void {
  useEffect(() => {
    if (!guardedRoutes.has(routeName)) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (released) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [routeName]);
}

// The form's own back arrow and step-1 Back call goBack, which removes the route.
// Intake's success alert also goes back, and that one mustn't ask.
const finishedJustNow = () => {
  const closed = lastClosedAlert();
  return !!closed && closed.title === 'Success' && Date.now() - closed.at < 2000;
};

export function useConfirmOnRemove(navigation: any, routeName: string): void {
  useEffect(() => {
    if (!navigation || !guardedRoutes.has(routeName)) return;
    let leaving = false;
    return navigation.addListener('beforeRemove', (event: any) => {
      if (leaving || released || finishedJustNow()) return;
      event.preventDefault();
      confirmLeave(routeName, () => {
        leaving = true;
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, routeName]);
}
