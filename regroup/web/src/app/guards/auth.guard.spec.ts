/**
 * NOTE: these specs do not execute. angular.json points the Karma target at a
 * karma.conf.js that has never existed in this repo, so `ng test` cannot run
 * and CI enforces only `tsc --noEmit -p tsconfig.spec.json`. Everything here is
 * typechecked, never evaluated. Treat it as documentation until a runner exists.
 *
 * The guard's deny path is unreachable. AuthService.doAutoLogin
 * cannot reject -- it try/catches autoLogin and setPersistence both -- so it always
 * resolves, with undefined when there is no session. The guard does
 * .then(() => true), discarding that value, so the .catch redirect at
 * auth.guard.ts:31-34 is unreachable and the guard admits unauthenticated users.
 * So the deny-path test below asserts that defect as it stands, rather than faking
 * a rejected doAutoLogin — a contract the real service does not honour. Tracked as
 * a separate fix; real protection today is MyAccountComponent.checkUser, which does
 * inspect the resolved user, plus the Firestore rules.
 */
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth/auth-service.service';

/**
 * Builds a TestBed for a given platform. The guard branches on
 * isPlatformBrowser(PLATFORM_ID), so "browser" vs "server" selects the path.
 */
function setup(platform: string, auth: Partial<AuthService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RouterTestingModule],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: PLATFORM_ID, useValue: platform },
    ],
  });
  return {
    guard: TestBed.inject(AuthGuard),
    router: TestBed.inject(Router),
  };
}

const route = null as any;
const state = null as any;

describe('AuthGuard', () => {
  it('should be created', () => {
    const { guard } = setup('browser', {
      user: null,
      doAutoLogin: () => Promise.resolve(null),
    } as any);
    expect(guard).toBeTruthy();
  });

  it('admits an already-authenticated user', () => {
    const { guard } = setup('browser', {
      user: { id: 'u1' },
      doAutoLogin: () => Promise.resolve(null),
    } as any);
    expect(guard.canActivate(route, state)).toBe(true);
  });

  it('admits an unauthenticated user when auto-login recovers the session', async () => {
    const { guard } = setup('browser', {
      user: null,
      doAutoLogin: () => Promise.resolve({ id: 'u1' }),
    } as any);
    const result = await Promise.resolve(guard.canActivate(route, state));
    expect(result).toBe(true);
  });

  // doAutoLogin cannot reject (see the header), so this pins what the guard really
  // does when there is no session: it admits. Asserted as-is rather than mocking a
  // rejection the real service never produces. When the guard is fixed to inspect
  // the resolved value, invert this to expect(false) and a /login navigation.
  it('admits an unauthenticated user when auto-login finds no session (known defect)', async () => {
    const { guard, router } = setup('browser', {
      user: null,
      doAutoLogin: () => Promise.resolve(undefined),
    } as any);
    const navigate = spyOn(router, 'navigate');
    const result = await Promise.resolve(guard.canActivate(route, state));
    expect(result).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });


  // Pins the SSR branch. Returning false here cancelled the navigation, so the
  // server rendered an incomplete shell; returning true lets the component mount
  // and issue its own redirect. Note the redirect does NOT come from this guard
  // re-running on the client — see the header. It comes from
  // MyAccountComponent.checkUser, which does inspect the resolved user.
  it('defers to the client during server-side rendering', () => {
    const { guard } = setup('server', {
      user: null,
      doAutoLogin: () => Promise.reject(new Error('must not be called on server')),
    } as any);
    expect(guard.canActivate(route, state)).toBe(true);
  });

  it('does not attempt auto-login during server-side rendering', () => {
    const doAutoLogin = jasmine.createSpy('doAutoLogin').and.returnValue(Promise.resolve(null));
    const { guard } = setup('server', { user: null, doAutoLogin } as any);
    guard.canActivate(route, state);
    expect(doAutoLogin).not.toHaveBeenCalled();
  });
});
