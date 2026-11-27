import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  AppLinkLandingComponent,
  APP_STORE_URL,
  PLAY_STORE_URL,
} from './app-link-landing.component';

// The page behind every app link (launch P5 Task 6): what someone sees when the
// link opens in the browser, because the app isn't installed or its app links
// aren't verified.
describe('AppLinkLandingComponent', () => {
  let fixture: ComponentFixture<AppLinkLandingComponent>;

  const render = (url: string, platform = 'browser'): HTMLElement => {
    TestBed.configureTestingModule({
      declarations: [AppLinkLandingComponent],
      providers: [
        { provide: Router, useValue: { url } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    fixture = TestBed.createComponent(AppLinkLandingComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const openButton = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('a.open-app');

  // The emailed link carries the token in the fragment (createInvitation's
  // buildInviteLink), which the browser never sends to the server.
  it('moves the invitation token from the fragment into the Open in Regroup button, with both store links', () => {
    const el = render('/invite#token=abc');
    expect(openButton(el)?.getAttribute('href')).toBe('regroup-app://invite?token=abc');
    expect(openButton(el)?.textContent).toContain('Open in Regroup');
    const hrefs = Array.from(el.querySelectorAll('a.store')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
  });

  it('hands a checkout result back to the app route', () => {
    const el = render('/checkout-return?result=success');
    expect(openButton(el)?.getAttribute('href')).toBe(
      'regroup-app://app/checkout-return?result=success',
    );
    expect(openButton(el)?.textContent).toContain('Return to Regroup');
  });

  it('keeps an /app/* route and its query', () => {
    const el = render('/app/house/settings?tab=rent');
    expect(openButton(el)?.getAttribute('href')).toBe('regroup-app://app/house/settings?tab=rent');
  });

  it('drops the fragment of an /app/* link', () => {
    const el = render('/app/house/settings?tab=rent#frag');
    expect(openButton(el)?.getAttribute('href')).toBe('regroup-app://app/house/settings?tab=rent');
  });

  it('renders a query or fragment with markup as text, never as markup', () => {
    const el = render(
      '/invite?x=<img src=x onerror=alert(1)>#token=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    );
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).not.toContain('alert(1)');
  });

  // The app drops an invitation whose token it can't read, so the page says
  // the link is incomplete instead of offering a button that does nothing.
  for (const url of [
    '/invite',
    '/invite#token=',
    '/invite#token=bad!',
    '/invite#token=a&token=b',
    // The app reads an https invitation's token from the fragment only.
    '/invite?token=abc',
  ]) {
    it(`says ${url} is an incomplete invitation, with no Open button`, () => {
      const el = render(url);
      expect(openButton(el)).toBeNull();
      expect(el.querySelector('.incomplete-invitation')?.textContent).toContain('incomplete');
      expect(el.querySelectorAll('a.store').length).toBe(2);
    });
  }

  it('keeps the Open button for a valid token with tracking parameters', () => {
    const el = render('/invite?utm_source=email#token=abc');
    expect(openButton(el)?.getAttribute('href')).toBe('regroup-app://invite?token=abc');
    expect(el.querySelector('.incomplete-invitation')).toBeNull();
  });

  // The server never receives the fragment, so it can't tell a complete
  // invitation from an incomplete one; the browser renders the real page.
  it('renders an invitation on the server without the incomplete message or an Open button', () => {
    const el = render('/invite', 'server');
    expect(openButton(el)).toBeNull();
    expect(el.querySelector('.incomplete-invitation')).toBeNull();
    expect(el.textContent).toContain('Continue in the Regroup app');
    expect(el.querySelectorAll('a.store').length).toBe(2);
  });

  it('still offers the Open button for other app links on the server', () => {
    const el = render('/checkout-return?result=success', 'server');
    expect(openButton(el)?.getAttribute('href')).toBe(
      'regroup-app://app/checkout-return?result=success',
    );
  });

  it('offers only the store links for a path outside the allowlist', () => {
    const el = render('/app/../../etc?x=1');
    expect(openButton(el)).toBeNull();
    expect(el.querySelectorAll('a.store').length).toBe(2);
  });

  it('logs nothing', () => {
    const spies = [
      spyOn(console, 'log'),
      spyOn(console, 'info'),
      spyOn(console, 'warn'),
      spyOn(console, 'error'),
    ];
    render('/invite#token=abc');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
