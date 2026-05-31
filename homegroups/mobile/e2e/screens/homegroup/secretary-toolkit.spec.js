const helpers = require('../../helpers');

async function navigateToSecretaryToolkit() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-secretary-toolkit-tile');
  await waitFor(element(by.text('Secretary Toolkit')))
    .toBeVisible()
    .withTimeout(8000);
}

describe('Secretary Toolkit', () => {
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
    await navigateToSecretaryToolkit();
  });

  it('should display secretary toolkit screen', async () => {
    await waitFor(element(by.text('Secretary Toolkit')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show meeting checklist option', async () => {
    await waitFor(element(by.id('start-checklist-button')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should navigate to meeting checklist', async () => {
    await helpers.waitAndTap('start-checklist-button');
    await waitFor(element(by.text('Meeting Checklist')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should NOT show meeting topics option (V4.2 hidden)', async () => {
    // Meeting Topics hidden via SHOW_V4_CONTENT_MEETING_TOPICS flag
    await waitFor(element(by.id('browse-meeting-topics-button')))
      .not.toBeVisible()
      .withTimeout(2000);
  });

  it('should navigate back from checklist', async () => {
    await helpers.waitAndTap('start-checklist-button');
    await waitFor(element(by.text('Meeting Checklist')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('Back')).tap();
    await waitFor(element(by.text('Secretary Toolkit')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
