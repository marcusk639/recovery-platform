const helpers = require('../../helpers');
const { TEST_EMAIL, TEST_PASSWORD } = require('../../env');

// Navigate from app start to the login screen
async function goToLogin() {
  // Try LandingScreen sign-in button first (visible during onboarding or limited mode)
  try {
    await waitFor(element(by.id('landing-signin-button')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('landing-signin-button')).tap();
  } catch (e) {
    // Already on login screen, or onboarding shows a sign-in path
  }
  await helpers.waitForElement('login-screen');
}

describe('Auth Flow', () => {
  describe('Login Screen', () => {
    beforeEach(async () => {
      await device.launchApp({newInstance: true});
      await goToLogin();
    });

    it('should display the login screen', async () => {
      await helpers.waitForElement('login-screen');
    });

    it('should show error for invalid credentials', async () => {
      await helpers.waitAndType('login-email-input', 'wrong@example.com');
      await helpers.waitAndType('login-password-input', 'wrongpassword');
      await helpers.waitAndTap('login-signin-button');
      await helpers.waitForElement('login-error-text');
    });

    it('should login successfully with valid credentials', async () => {
      await helpers.waitAndType('login-email-input', TEST_EMAIL);
      await helpers.waitAndType('login-password-input', TEST_PASSWORD);
      await helpers.waitAndTap('login-signin-button');
      await helpers.waitForElement('group-list-screen');
    });

    it('should navigate to forgot password screen', async () => {
      await helpers.waitAndTap('login-forgot-password-button');
      await helpers.waitForElement('forgot-password-screen');
    });

    it('should navigate to register screen', async () => {
      await helpers.waitAndTap('login-register-link');
      await helpers.waitForElement('register-screen');
    });
  });

  describe('Forgot Password', () => {
    beforeEach(async () => {
      await device.launchApp({newInstance: true});
      await goToLogin();
      await helpers.waitAndTap('login-forgot-password-button');
      await helpers.waitForElement('forgot-password-screen');
    });

    it('should display the forgot password screen', async () => {
      await helpers.waitForElement('forgot-password-screen');
    });

    it('should show error for invalid email format', async () => {
      await helpers.waitAndType('forgot-password-email-input', 'notanemail');
      await helpers.waitAndTap('forgot-password-reset-button');
      await helpers.waitForElement('forgot-password-error-text');
    });

    it('should show success state after sending valid email', async () => {
      await helpers.waitAndType('forgot-password-email-input', TEST_EMAIL);
      await helpers.waitAndTap('forgot-password-reset-button');
      await helpers.waitForElement('forgot-password-return-to-login-button');
    });

    it('should navigate back to login via back button', async () => {
      await helpers.waitAndTap('forgot-password-back-button');
      await helpers.waitForElement('login-screen');
    });
  });

  describe('Logout', () => {
    beforeEach(async () => {
      await device.launchApp({newInstance: true});
      await goToLogin();
      await helpers.login();
    });

    it('should sign out when tapping profile sign-out button', async () => {
      await helpers.logout();
      // After sign out completes without crash -- success
    });
  });
});
