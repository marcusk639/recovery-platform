import { jquery, jqueryPlugin } from './jquery';
import { HeaderTwoComponent } from '../components/header/header-two/header-two.component';
import { DownloadComponent } from '../components/download/download.component';
import { ScreenshotOneComponent } from '../components/screenshots/screenshot-one/screenshot-one.component';
import { AppComponent } from '../app.component';

// The vendor scripts src/index.html loads (jQuery, Bootstrap, the theme
// plugins) are not in the build, so window.$ is undefined in every deployed
// app. A component that calls $ in ngOnInit throws and aborts Angular's first
// render pass: the home page loses its header and hero text.
describe('jquery (vendor scripts may be missing)', () => {
  let saved: any;
  beforeEach(() => {
    saved = (window as any).$;
    delete (window as any).$;
  });
  afterEach(() => {
    if (saved === undefined) delete (window as any).$;
    else (window as any).$ = saved;
  });

  it('returns null when jQuery is not loaded', () => {
    expect(jquery()).toBeNull();
    expect(jqueryPlugin('slick')).toBeNull();
  });

  it('returns jQuery, and a plugin only when that plugin is loaded', () => {
    const $: any = () => ({});
    $.fn = { tooltip: () => undefined };
    (window as any).$ = $;
    expect(jquery()).toBe($);
    expect(jqueryPlugin('tooltip')).toBe($);
    expect(jqueryPlugin('slick')).toBeNull();
  });

  it('home-page components initialise without jQuery', () => {
    const none: any = null;
    const header = new HeaderTwoComponent(none, 'browser', none, none, none);
    expect(() => header.ngOnInit()).not.toThrow();
    expect(header.logoFilePath).toBe('assets/img/logo.png');
    expect(() => header.toggleDrawer()).not.toThrow();
    expect(() => new DownloadComponent('browser').ngOnInit()).not.toThrow();
    expect(() => new ScreenshotOneComponent('browser').ngOnInit()).not.toThrow();
  });

  it('home-page components skip plugins jQuery has not loaded', () => {
    const calls: string[] = [];
    const $: any = (arg: unknown) => {
      if (typeof arg === 'function') (arg as () => void)();
      return { on: () => calls.push('on'), toggleClass: () => calls.push('toggleClass') };
    };
    $.fn = {};
    (window as any).$ = $;
    expect(() => new DownloadComponent('browser').ngOnInit()).not.toThrow();
    expect(() => new ScreenshotOneComponent('browser').ngOnInit()).not.toThrow();
    const none: any = null;
    new HeaderTwoComponent(none, 'browser', none, none, none).ngOnInit();
    expect(calls).toEqual(['on']);
  });

  it('the app still restores the session without jQuery', async () => {
    const auth: any = { doAutoLogin: jasmine.createSpy('doAutoLogin').and.resolveTo(null) };
    const analytics: any = { logEvent: () => undefined };
    await new AppComponent('browser', auth, analytics).ngOnInit();
    expect(auth.doAutoLogin).toHaveBeenCalled();
    expect(typeof (window as any).isMobile).toBe('function');
  });
});
