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

  const render = (url: string): HTMLElement => {
    TestBed.configureTestingModule({
      declarations: [AppLinkLandingComponent],
      providers: [{ provide: Router, useValue: { url } }],
    });
    fixture = TestBed.createComponent(AppLinkLandingComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const openButton = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('a.open-app');

  it('keeps an invitation token in the Open in Regroup button, with both store links', () => {
    const el = render('/invite?token=abc');
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

  it('drops a fragment', () => {
    const el = render('/invite?token=abc#frag');
    expect(openButton(el)?.getAttribute('href')).toBe('regroup-app://invite?token=abc');
  });

  it('renders a query with markup as text, never as markup', () => {
    const el = render(
      '/invite?token=%3Cscript%3Ealert(1)%3C%2Fscript%3E&x=<img src=x onerror=alert(1)>',
    );
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).not.toContain('alert(1)');
  });

  // The app drops an invitation whose token it can't read, so the page says
  // the link is incomplete instead of offering a button that does nothing.
  for (const url of [
    '/invite',
    '/invite?token=',
    '/invite?token=bad!',
    '/invite?token=a&token=b',
  ]) {
    it(`says ${url} is an incomplete invitation, with no Open button`, () => {
      const el = render(url);
      expect(openButton(el)).toBeNull();
      expect(el.querySelector('.incomplete-invitation')?.textContent).toContain('incomplete');
      expect(el.querySelectorAll('a.store').length).toBe(2);
    });
  }

  it('keeps the Open button for a valid token with tracking parameters', () => {
    const el = render('/invite?token=abc&utm_source=email');
    expect(openButton(el)?.getAttribute('href')).toBe(
      'regroup-app://invite?token=abc&utm_source=email',
    );
    expect(el.querySelector('.incomplete-invitation')).toBeNull();
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
    render('/invite?token=abc');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
