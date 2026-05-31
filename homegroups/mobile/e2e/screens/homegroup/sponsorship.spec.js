const helpers = require('../../helpers');

async function navigateToGroupSponsors() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-sponsors-tile');
  await waitFor(element(by.text('Sponsors')))
    .toBeVisible()
    .withTimeout(8000);
}

describe('Group Sponsors Screen', () => {
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
    await navigateToGroupSponsors();
  });

  it('should display sponsors screen', async () => {
    await waitFor(element(by.text('Sponsors')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show available sponsors list or empty state', async () => {
    try {
      await waitFor(element(by.id('sponsors-list')))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id('sponsors-empty-state')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it('should navigate back to group overview', async () => {
    await element(by.text('Back')).tap();
    await helpers.waitForElement('group-info-section');
  });
});

describe('My Sponsorships (Profile)', () => {
  async function navigateToMySponsorships() {
    await element(by.text('Profile')).tap();
    await waitFor(element(by.id('profile-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await helpers.waitAndTap('profile-my-sponsorships-button');
    await waitFor(element(by.text('My Sponsorships')))
      .toBeVisible()
      .withTimeout(8000);
  }

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
    await navigateToMySponsorships();
  });

  it('should display my sponsorships screen', async () => {
    await waitFor(element(by.text('My Sponsorships')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show active and pending sponsorships or empty state', async () => {
    try {
      await waitFor(element(by.id('my-sponsorships-list')))
        .toBeVisible()
        .withTimeout(5000);
    } catch (e) {
      await waitFor(element(by.id('my-sponsorships-empty')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });
});
