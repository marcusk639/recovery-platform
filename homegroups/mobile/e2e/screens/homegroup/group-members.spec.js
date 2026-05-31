const helpers = require('../../helpers');

async function navigateToMembers() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-members-tile');
  await helpers.waitForElement('group-members-list');
}

describe('Group Members Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToMembers();
  });

  it('should display the members list', async () => {
    await helpers.waitForElement('group-members-list');
  });

  it('should show the invite button in header', async () => {
    await helpers.waitForElement('group-members-invite-button');
  });

  it('should navigate to member detail when tapping a member', async () => {
    await element(by.id('group-members-list')).atIndex(0).tap();
    await helpers.waitForElement('member-detail-screen');
    try { await element(by.text('Back')).tap(); } catch (e) {}
    await helpers.waitForElement('group-members-list');
  });
});
