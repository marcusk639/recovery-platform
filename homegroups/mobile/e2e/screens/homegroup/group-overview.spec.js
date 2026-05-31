const helpers = require('../../helpers');

async function navigateToGroupOverview() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
}

describe('Group Overview Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToGroupOverview();
  });

  it('should display group info section', async () => {
    await helpers.waitForElement('group-info-section');
  });

  it('should display upcoming meetings section or no-meetings message', async () => {
    try {
      await helpers.waitForElement('group-upcoming-meetings-section');
    } catch (e) {
      await helpers.waitForElement('group-overview-no-meetings');
    }
  });

  it('should display announcements section or no-announcements message', async () => {
    try {
      await helpers.waitForElement('group-announcements-section');
    } catch (e) {
      await helpers.waitForElement('group-overview-no-announcements');
    }
  });

  it('should show members tile', async () => {
    await helpers.waitForElement('group-overview-members-tile');
  });

  it('should show announcements tile', async () => {
    await helpers.waitForElement('group-overview-announcements-tile');
  });

  it('should show treasury tile', async () => {
    await helpers.waitForElement('group-overview-treasury-tile');
  });

  it('should show chat tile', async () => {
    await helpers.waitForElement('group-overview-chat-tile');
  });

  it('should navigate to members screen via tile', async () => {
    await helpers.waitAndTap('group-overview-members-tile');
    await helpers.waitForElement('group-members-list');
    try { await element(by.text('Back')).tap(); } catch (e) {}
  });

  it('should navigate to announcements screen via tile', async () => {
    await helpers.waitAndTap('group-overview-announcements-tile');
    await helpers.waitForElement('group-announcements-list');
    try { await element(by.text('Back')).tap(); } catch (e) {}
  });

  it('should navigate to treasury screen via tile', async () => {
    await helpers.waitAndTap('group-overview-treasury-tile');
    await helpers.waitForElement('treasury-summary-section');
    try { await element(by.text('Back')).tap(); } catch (e) {}
  });

  it('should navigate to chat screen via tile', async () => {
    await helpers.waitAndTap('group-overview-chat-tile');
    await helpers.waitForElement('chat-message-list');
    try { await element(by.text('Back')).tap(); } catch (e) {}
  });
});
