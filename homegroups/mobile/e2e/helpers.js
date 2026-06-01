const { TEST_EMAIL, TEST_PASSWORD } = require('./env');

const helpers = {
  async login() {
    await waitFor(element(by.id('login-email-input')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('login-email-input')).typeText(TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
    await element(by.id('login-signin-button')).tap();
    await waitFor(element(by.id('group-list-screen')))
      .toBeVisible()
      .withTimeout(10000);
  },

  async logout() {
    await element(by.text('Profile')).tap();
    await waitFor(element(by.id('profile-sign-out-button')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('profile-sign-out-button')).tap();
    await new Promise(resolve => setTimeout(resolve, 2000));
  },

  async waitAndTap(elementId, timeout = 5000) {
    await waitFor(element(by.id(elementId)))
      .toBeVisible()
      .withTimeout(timeout);
    await element(by.id(elementId)).tap();
  },

  async waitAndType(elementId, text, timeout = 5000) {
    await waitFor(element(by.id(elementId)))
      .toBeVisible()
      .withTimeout(timeout);
    await element(by.id(elementId)).clearText();
    await element(by.id(elementId)).typeText(text);
  },

  async waitForElement(elementId, timeout = 5000) {
    await waitFor(element(by.id(elementId)))
      .toBeVisible()
      .withTimeout(timeout);
  },

  async scrollToElement(elementId, scrollViewId, direction = 'down') {
    await waitFor(element(by.id(scrollViewId))).toBeVisible().withTimeout(5000);
    await waitFor(element(by.id(elementId)))
      .toBeVisible()
      .whileElement(by.id(scrollViewId))
      .scroll(200, direction);
  },
};

module.exports = helpers;
