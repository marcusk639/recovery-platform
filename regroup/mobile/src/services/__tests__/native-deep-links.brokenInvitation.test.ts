/**
 * The link listener and the initial link pass a broken invitation link on to
 * Splash, which tells the user. Before, isValidDeepLink dropped it and the app
 * opened with nothing happening. Unrelated links are still dropped.
 */
import { Linking } from 'react-native';
import { getInitialLink, onLink } from '../native-deep-links';

describe('broken invitation links reach the app', () => {
  let addListener: jest.SpyInstance;
  let initialUrl: jest.SpyInstance;
  let urlHandler: (event: { url: string }) => void;

  beforeEach(() => {
    addListener = jest.spyOn(Linking, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (event: { url: string }) => void,
    ) => {
      urlHandler = handler;
      return { remove: jest.fn() };
    }) as any);
    initialUrl = jest.spyOn(Linking, 'getInitialURL');
  });
  afterEach(() => {
    addListener.mockRestore();
    initialUrl.mockRestore();
  });

  it('the listener passes on a broken invitation link', () => {
    const listener = jest.fn();
    onLink(listener);
    urlHandler({ url: 'regroup-app://invite?token=bad!' });
    expect(listener).toHaveBeenCalledWith({ url: 'regroup-app://invite?token=bad!' });
  });

  it('the listener still drops a link that is not for the app', () => {
    const listener = jest.fn();
    onLink(listener);
    urlHandler({ url: 'https://evil.example/invite?token=' });
    urlHandler({ url: 'regroup-app://somewhere-else' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('a cold start from a broken invitation link returns it', async () => {
    initialUrl.mockResolvedValueOnce('https://regroup-app.com/invite?token=');
    await expect(getInitialLink()).resolves.toEqual({
      url: 'https://regroup-app.com/invite?token=',
    });
  });

  it('a cold start from an unrelated link returns nothing', async () => {
    initialUrl.mockResolvedValueOnce('https://regroup-app.com/pricing');
    await expect(getInitialLink()).resolves.toBeNull();
  });
});
