import fs from 'fs';
import path from 'path';
import { Alert, Linking } from 'react-native';
import { openWebBilling, webBillingUrl, WebBillingPage } from '../webBilling';
import { logException } from '../../util/logging';

jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

const PAGES: WebBillingPage[] = ['pricing', 'my-account'];
const original = process.env.RATS_WEB_URL;

afterEach(() => {
  if (original === undefined) delete process.env.RATS_WEB_URL;
  else process.env.RATS_WEB_URL = original;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('webBillingUrl', () => {
  it('opens production pricing with from=app by default', () => {
    delete process.env.RATS_WEB_URL;
    expect(webBillingUrl('pricing')).toBe('https://regroup-app.com/pricing?from=app');
    expect(webBillingUrl('my-account')).toBe('https://regroup-app.com/my-account?from=app');
  });

  it('honours RATS_WEB_URL as a base', () => {
    process.env.RATS_WEB_URL = 'https://regroup-e2e.web.app/';
    expect(webBillingUrl('pricing')).toBe('https://regroup-e2e.web.app/pricing?from=app');
  });

  it('carries nothing but from=app in the query', () => {
    delete process.env.RATS_WEB_URL;
    for (const page of PAGES) {
      expect([...new URL(webBillingUrl(page)).searchParams.keys()]).toEqual(['from']);
    }
  });

  // Review Focus 1: a claimed path would reopen the app instead of the browser.
  it('never produces a path that regroup/app-links.json claims', () => {
    const source = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../../app-links.json'), 'utf8'),
    ) as { paths: string[] };
    const claims = (p: string) =>
      source.paths.some((claimed) =>
        claimed.endsWith('/*') ? p.startsWith(claimed.slice(0, -1)) : p === claimed,
      );
    for (const page of PAGES) {
      const { pathname } = new URL(webBillingUrl(page));
      expect(claims(pathname)).toBe(false);
    }
  });
});

describe('openWebBilling', () => {
  it('opens the page in the browser and returns true', async () => {
    delete process.env.RATS_WEB_URL;
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined);
    await expect(openWebBilling('my-account')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://regroup-app.com/my-account?from=app');
  });

  it('alerts and returns false when the browser does not open, logging no URL', async () => {
    delete process.env.RATS_WEB_URL;
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(
      new Error('cannot open https://regroup-app.com/pricing?from=app'),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await expect(openWebBilling('pricing')).resolves.toBe(false);
    expect(alert).toHaveBeenCalledWith('Unable to open browser', 'Please visit https://regroup-app.com/pricing.');
    const logged = String((logException as jest.Mock).mock.calls[0][0]);
    expect(logged).not.toMatch(/https?:/);
  });
});
