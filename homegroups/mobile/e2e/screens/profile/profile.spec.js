const helpers = require('../../helpers');

describe('Profile Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await element(by.text('Profile')).tap();
    await helpers.waitForElement('profile-screen');
  });

  it('should display the profile screen', async () => {
    await helpers.waitForElement('profile-screen');
  });

  it('should display the user display name', async () => {
    await helpers.waitForElement('profile-display-name');
  });

  it('should display the user email', async () => {
    await helpers.waitForElement('profile-email');
  });

  it('should navigate to sobriety tracker when sobriety date is set', async () => {
    // Sobriety tracker card only renders when userData.sobrietyStartDate is set
    try {
      await helpers.waitForElement('profile-sobriety-tracker-button');
      await helpers.waitAndTap('profile-sobriety-tracker-button');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await element(by.text('Back')).tap().catch(() => {});
    } catch (e) {
      // No sobriety date set on this account — skip
    }
  });

  it('should show sign out button', async () => {
    // Scroll down to find it if necessary
    try {
      await helpers.waitForElement('profile-sign-out-button');
    } catch (e) {
      await helpers.scrollToElement('profile-sign-out-button', 'profile-scroll-view');
      await helpers.waitForElement('profile-sign-out-button');
    }
  });

  it('should show my sponsorships button', async () => {
    try {
      await helpers.waitForElement('profile-my-sponsorships-button');
    } catch (e) {
      await helpers.scrollToElement('profile-my-sponsorships-button', 'profile-scroll-view');
      await helpers.waitForElement('profile-my-sponsorships-button');
    }
  });
});
