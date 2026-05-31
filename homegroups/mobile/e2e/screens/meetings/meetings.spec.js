const helpers = require('../../helpers');

describe('Meetings Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    // Handle onboarding/landing if shown (same pattern as auth spec)
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await element(by.text('Meetings')).tap();
    await helpers.waitForElement('meetings-screen');
  });

  it('should display the meetings list', async () => {
    await helpers.waitForElement('meetings-list');
  });

  it('should search for meetings by name', async () => {
    await helpers.waitAndType('meetings-search-input', 'AA');
    await helpers.waitForElement('meetings-list');
  });

  it('should clear search and show full list', async () => {
    await helpers.waitAndType('meetings-search-input', 'test');
    await element(by.id('meetings-search-input')).clearText();
    await helpers.waitForElement('meetings-list');
  });

  it('should open the filter modal', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
  });

  it('should close filter modal without applying', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
    await helpers.waitAndTap('meetings-filter-close-button');
    await helpers.waitForElement('meetings-screen');
  });

  it('should filter by in-person meetings', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
    await helpers.waitAndTap('filter-inperson-button');
    await helpers.waitAndTap('meetings-filter-apply-button');
    await helpers.waitForElement('meetings-list');
  });

  it('should filter by online meetings', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
    await helpers.waitAndTap('filter-online-button');
    await helpers.waitAndTap('meetings-filter-apply-button');
    await helpers.waitForElement('meetings-list');
  });

  it('should filter by meeting type chip', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
    await helpers.waitAndTap('filter-type-AA-chip');
    await helpers.waitAndTap('meetings-filter-apply-button');
    await helpers.waitForElement('meetings-list');
  });

  it('should filter by day of week chip', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitForElement('meetings-filter-modal');
    await helpers.waitAndTap('filter-day-Monday-chip');
    await helpers.waitAndTap('meetings-filter-apply-button');
    await helpers.waitForElement('meetings-list');
  });

  it('should reset all filters', async () => {
    await helpers.waitAndTap('meetings-filter-button');
    await helpers.waitAndTap('filter-type-NA-chip');
    await helpers.waitAndTap('meetings-filter-apply-button');
    await helpers.waitAndTap('meetings-reset-filters-button');
    await helpers.waitForElement('meetings-list');
  });
});
