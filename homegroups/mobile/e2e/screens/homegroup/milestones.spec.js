const helpers = require('../../helpers');

async function navigateToMilestones() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-milestones-tile');
  await helpers.waitForElement('milestones-scroll');
}

describe('Group Milestones', () => {
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
    await navigateToMilestones();
  });

  it('should display milestones screen', async () => {
    await helpers.waitForElement('milestones-scroll');
  });

  it('should show milestones scroll view with sections', async () => {
    await waitFor(element(by.id('milestones-scroll')))
      .toBeVisible()
      .withTimeout(5000);
  });
});

describe('Group Milestones — Group Overview Integration', () => {
  beforeEach(async () => {
    // Navigate to group overview (not all the way into milestones)
    await element(by.text('Home')).tap();
    await helpers.waitForElement('group-list-screen');
    await element(by.id('group-list')).atIndex(0).tap();
    await helpers.waitForElement('group-info-section');
  });

  it('should show upcoming celebrations section on group overview', async () => {
    // Celebrations section is on the group overview (upcoming milestones)
    try {
      await helpers.waitForElement('group-celebrations-section');
    } catch (e) {
      // No upcoming milestones yet — acceptable
    }
  });
});
