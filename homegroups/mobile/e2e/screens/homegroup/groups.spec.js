const helpers = require('../../helpers');

describe('Groups List Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await element(by.text('Home')).tap();
    await helpers.waitForElement('group-list-screen');
  });

  it('should display the groups list screen', async () => {
    await helpers.waitForElement('group-list-screen');
  });

  it('should display the groups list', async () => {
    await helpers.waitForElement('group-list');
  });

  it('should show the invite code button', async () => {
    await helpers.waitForElement('group-list-invite-code-button');
  });

  it('should show the create group button', async () => {
    await helpers.waitForElement('group-list-create-button');
  });

  it('should show the search button', async () => {
    await helpers.waitForElement('group-list-search-button');
  });

  it('should navigate into a group when tapping a group card', async () => {
    await helpers.waitForElement('group-list');
    // Tap first child of group-list FlatList
    await element(by.id('group-list')).atIndex(0).tap();
    await helpers.waitForElement('group-info-section');
  });
});
