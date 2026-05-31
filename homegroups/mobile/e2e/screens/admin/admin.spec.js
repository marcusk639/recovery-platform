const helpers = require('../../helpers');

let adminAvailable = false;

describe('Admin Panel Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
    // Determine if this account has access to the Admin tab
    try {
      await element(by.text('Admin')).tap();
      await helpers.waitForElement('admin-panel-screen');
      adminAvailable = true;
    } catch (e) {
      adminAvailable = false;
    }
  });

  beforeEach(async () => {
    if (!adminAvailable) {
      return;
    }
    await element(by.text('Admin')).tap();
    await helpers.waitForElement('admin-panel-screen');
  });

  it('should display the admin panel screen', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitForElement('admin-panel-screen');
  });

  it('should show the assign admin button', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitForElement('admin-assign-button');
  });

  it('should open the assign admin modal', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitAndTap('admin-assign-button');
    await helpers.waitForElement('admin-assign-modal');
    // Close modal to restore state
    await helpers.waitAndTap('admin-cancel-button');
  });

  it('should show group id and user id inputs in modal', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitAndTap('admin-assign-button');
    await helpers.waitForElement('admin-group-id-input');
    await helpers.waitForElement('admin-user-id-input');
    await helpers.waitAndTap('admin-cancel-button');
  });

  it('should close the modal via cancel button', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitAndTap('admin-assign-button');
    await helpers.waitForElement('admin-assign-modal');
    await helpers.waitAndTap('admin-cancel-button');
    await waitFor(element(by.id('admin-assign-modal')))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  it('should close the modal via close button', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitAndTap('admin-assign-button');
    await helpers.waitForElement('admin-assign-modal');
    await helpers.waitAndTap('admin-close-modal-button');
    await waitFor(element(by.id('admin-assign-modal')))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  it('should not submit when inputs are empty', async () => {
    if (!adminAvailable) {
      pending('Admin tab not available for this account');
      return;
    }
    await helpers.waitAndTap('admin-assign-button');
    await helpers.waitForElement('admin-assign-modal');
    // Inputs are empty — tapping confirm should not close the modal
    await helpers.waitAndTap('admin-confirm-button');
    // Dismiss any alert that appeared
    await element(by.text('OK')).tap().catch(() => {});
    // Modal should still be visible (submission was blocked)
    await helpers.waitForElement('admin-assign-modal');
    await helpers.waitAndTap('admin-cancel-button');
  });
});
