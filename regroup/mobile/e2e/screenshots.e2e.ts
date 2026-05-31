/**
 * App Store Screenshot Capture Tests
 *
 * Captures 5 key screens for App Store submission.
 * Run after building with: npm run test:e2e:build:ios
 * Execute with: npm run test:e2e:ios -- --testPathPattern screenshots
 *
 * NOTE: This file uses .e2e.ts extension. To run it with Detox directly:
 *   npx detox test e2e/screenshots.e2e.ts --configuration ios.sim.debug \
 *     --artifacts-location ./fastlane/screenshots/ios --take-screenshots all
 *
 * Test account prerequisites:
 *   - test-manager@rats-e2e.com must have at least one house with guests
 *   - E2E_TEST_PASSWORD env var must be set (falls back to 'TestPassword123!')
 */

import { device, element, by, waitFor } from 'detox';

const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

describe('App Store Screenshots', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES', location: 'always' },
    });
  });

  it('01 — Login screen', async () => {
    // Wait for the initial landing screen, then navigate to login
    await waitFor(element(by.id('initial-landing-screen')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('sign-in-button')).tap();

    // Wait for login screen to be visible
    await waitFor(element(by.id('login-screen')))
      .toBeVisible()
      .withTimeout(15000);

    await device.takeScreenshot('01-login');
  });

  it('02 — House dashboard (operator)', async () => {
    // Fill credentials — testIDs confirmed in LoginFormView.tsx
    await element(by.id('email-input')).typeText('test-manager@rats-e2e.com');
    await new Promise(resolve => setTimeout(resolve, 800));
    await element(by.id('password-input')).typeText(E2E_PASSWORD);
    await element(by.id('password-input')).tapReturnKey();

    await device.disableSynchronization();
    // login-button confirmed in LoginFormView.tsx
    await element(by.id('login-button')).tap();

    // house-tab confirmed in src/navigation/navigators.tsx (tabBarButtonTestID)
    await waitFor(element(by.id('house-tab')))
      .toBeVisible()
      .withTimeout(60000);
    await device.enableSynchronization();

    // TODO: add testID="house-overview-screen" to the House overview root View
    // so we can assert the correct screen loaded before screenshotting.
    await device.takeScreenshot('02-house-dashboard');
  });

  it('03 — Guest profile', async () => {
    // Navigate to the guest list via the manage-guests-button on the house dashboard
    await element(by.id('manage-guests-button')).tap();
    await waitFor(element(by.id('guest-list-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Tap the first guest row (testID added to GuestList.tsx Section rows)
    await element(by.id('guest-list-item')).atIndex(0).tap();

    // guest-overview-screen is the real testID in src/screens/Profile/GuestHome.tsx
    await waitFor(element(by.id('guest-overview-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await device.takeScreenshot('03-guest-profile');
  });

  it('04 — Payment dashboard', async () => {
    // Navigate back to house tab, then into Payments
    await element(by.id('house-tab')).tap();
    await element(by.text('Payments')).tap();

    // payment-dashboard-screen added to root View of PaymentDashboard.tsx
    await waitFor(element(by.id('payment-dashboard-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await device.takeScreenshot('04-payment-dashboard');
  });

  it('05 — House search screen', async () => {
    // Re-launch to unauthenticated landing to reach HouseSearch
    await device.launchApp({ newInstance: true });

    await waitFor(element(by.id('initial-landing-screen')))
      .toBeVisible()
      .withTimeout(30000);

    // Select "guest" so the form is valid, then tap NEXT (nav-house-search)
    // which navigates to HouseSearch when potentialUserType === 'guest'
    await element(by.text("I'm looking to join a recovery home.")).tap();
    await element(by.id('nav-house-search')).tap();

    // house-search-screen added to root View of HouseSearchScreen.tsx
    await waitFor(element(by.id('house-search-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await device.takeScreenshot('05-house-search');
  });
});
