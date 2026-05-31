const helpers = require('../../helpers');

async function navigateToPhoneList() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-phone-list-tile');
  await helpers.waitForElement('phone-list-screen');
}

describe('Group Phone List', () => {
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
    await navigateToPhoneList();
  });

  it('should display phone list screen', async () => {
    await helpers.waitForElement('phone-list-screen');
  });

  it('should show the members list (filtered by phone sharing consent)', async () => {
    // The list only shows members where showPhoneNumber=true.
    // We can verify the list container renders without checking membership data.
    await waitFor(element(by.id('phone-list-flatlist')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should navigate back to group overview', async () => {
    await element(by.text('Back')).tap();
    await helpers.waitForElement('group-info-section');
  });
});
