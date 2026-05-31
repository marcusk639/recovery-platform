const helpers = require('../../helpers');

async function navigateToGroupConscience() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-conscience-tile');
  await waitFor(element(by.text('Group Conscience')))
    .toBeVisible()
    .withTimeout(8000);
}

describe('Group Conscience Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button')))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToGroupConscience();
  });

  it('should display group conscience screen', async () => {
    await waitFor(element(by.text('Group Conscience')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show active votes or empty state', async () => {
    try {
      await waitFor(element(by.id('conscience-votes-list')))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id('conscience-votes-empty')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it('should show create vote button for admin', async () => {
    await waitFor(element(by.id('new-vote-button')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should navigate to create vote screen', async () => {
    await helpers.waitAndTap('new-vote-button');
    await waitFor(element(by.text('New Group Conscience Vote')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should cancel creating a vote', async () => {
    await helpers.waitAndTap('new-vote-button');
    try {
      await element(by.text('Cancel')).tap();
    } catch (e) {
      await element(by.text('Back')).tap();
    }
    await waitFor(element(by.text('Group Conscience')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
