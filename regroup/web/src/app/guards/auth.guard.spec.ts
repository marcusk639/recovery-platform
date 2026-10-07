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

  it('denies access and redirects to /login when auto-login fails', async () => {
    const { guard, router } = setup('browser', {
      user: null,
      doAutoLogin: () => Promise.reject(new Error('no session')),
    } as any);
    const navigate = spyOn(router, 'navigate');
    const result = await Promise.resolve(guard.canActivate(route, state));
    expect(result).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['login']);
  });

  // Regression cover for the 2026-09-28 SSR fix. This previously returned false,
  // which made Angular Universal refuse to render the route rather than redirect —
  // an unauthenticated request produced a blank prerender instead of reaching
  // /login. Enforcement is deliberately deferred to the client, which re-runs the
  // guard on bootstrap and performs the redirect there.
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
