const helpers = require('../../helpers');

async function navigateToAnnouncements() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-announcements-tile');
  await helpers.waitForElement('group-announcements-list');
}

describe('Group Announcements Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToAnnouncements();
  });

  it('should display announcements list', async () => {
    try {
      await helpers.waitForElement('group-announcements-list');
    } catch (e) {
      await helpers.waitForElement('announcements-empty-list');
    }
  });

  it('should show create announcement button for admin users', async () => {
    await helpers.waitForElement('group-announcements-create-button');
  });

  it('should open create announcement modal', async () => {
    await helpers.waitAndTap('group-announcements-create-button');
    await helpers.waitForElement('announcement-title-input');
    // Dismiss
    try { await element(by.text('Cancel')).tap(); } catch (e) {}
  });

  it('should create a new announcement', async () => {
    await helpers.waitAndTap('group-announcements-create-button');
    await helpers.waitAndType('announcement-title-input', 'E2E Test Announcement');
    await helpers.waitAndType('announcement-content-input', 'Created by e2e test');
    await helpers.waitAndTap('announcement-submit-button');
    await helpers.waitForElement('group-announcements-list');
  });
});
