const helpers = require('../../helpers');

async function navigateToTreasury() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-treasury-tile');
  await helpers.waitForElement('treasury-summary-section');
}

describe('Treasury Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToTreasury();
  });

  describe('Treasury Overview', () => {
    it('should display treasury summary section', async () => {
      await helpers.waitForElement('treasury-summary-section');
    });

    it('should display transactions list when transactions exist', async () => {
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should show add transaction button for treasurer/admin', async () => {
      await helpers.waitForElement('treasury-add-transaction-button');
    });
  });

  describe('Add Transaction', () => {
    it('should navigate to add transaction screen', async () => {
      await helpers.waitAndTap('treasury-add-transaction-button');
      await helpers.waitForElement('add-tx-amount-input');
    });

    it('should add an income transaction', async () => {
      await helpers.waitAndTap('treasury-add-transaction-button');

      // Select income type
      await helpers.waitAndTap('add-tx-type-income-button');

      // Enter amount
      await helpers.waitAndType('add-tx-amount-input', '50.00');

      // Enter description
      await helpers.waitAndType(
        'add-tx-description-input',
        'Test 7th Tradition',
      );

      // Save transaction
      await helpers.waitAndTap('add-tx-save-button');

      // Verify navigation back and success
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should add an expense transaction', async () => {
      await helpers.waitAndTap('treasury-add-transaction-button');

      // Select expense type
      await helpers.waitAndTap('add-tx-type-expense-button');

      // Enter amount
      await helpers.waitAndType('add-tx-amount-input', '25.00');

      // Enter description
      await helpers.waitAndType(
        'add-tx-description-input',
        'Test Rent Payment',
      );

      // Save transaction
      await helpers.waitAndTap('add-tx-save-button');

      // Verify navigation back
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should show validation error for invalid amount', async () => {
      await helpers.waitAndTap('treasury-add-transaction-button');

      // Enter invalid amount
      await helpers.waitAndType('add-tx-amount-input', '0');

      // Try to save
      await helpers.waitAndTap('add-tx-save-button');

      // Should still be on add screen (validation failed)
      await helpers.waitForElement('add-tx-amount-input');
    });
  });

  describe('Edit Transaction', () => {
    it('should show edit button on transaction item for admin/treasurer', async () => {
      await helpers.waitForElement('treasury-transactions-list');
      // First transaction should have edit button
      await waitFor(element(by.id(/^edit-transaction-/)))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should open edit modal when tapping edit button', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button on first transaction
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      // Verify edit modal is visible
      await helpers.waitForElement('edit-transaction-modal');
      await helpers.waitForElement('edit-tx-form');
    });

    it('should populate form with existing transaction data', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button on first transaction
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      // Verify form elements are visible and populated
      await helpers.waitForElement('edit-tx-amount-input');
      await helpers.waitForElement('edit-tx-category-picker');
      await helpers.waitForElement('edit-tx-description-input');
    });

    it('should update transaction amount successfully', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Clear and enter new amount
      await element(by.id('edit-tx-amount-input')).clearText();
      await element(by.id('edit-tx-amount-input')).typeText('75.50');

      // Save changes
      await helpers.waitAndTap('edit-tx-save-button');

      // Verify modal closes and we're back to treasury screen
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should update transaction description successfully', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Clear and enter new description
      await element(by.id('edit-tx-description-input')).clearText();
      await element(by.id('edit-tx-description-input')).typeText(
        'Updated description via e2e test',
      );

      // Save changes
      await helpers.waitAndTap('edit-tx-save-button');

      // Verify modal closes
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should change transaction type from expense to income', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Tap income type button
      await helpers.waitAndTap('edit-tx-type-income-button');

      // Save changes
      await helpers.waitAndTap('edit-tx-save-button');

      // Verify modal closes
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should cancel edit without saving changes', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Make changes
      await element(by.id('edit-tx-amount-input')).clearText();
      await element(by.id('edit-tx-amount-input')).typeText('999.99');

      // Cancel instead of save
      await helpers.waitAndTap('edit-tx-cancel-button');

      // Verify we're back to treasury screen
      await helpers.waitForElement('treasury-transactions-list');
    });

    it('should show validation error for zero amount', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Enter invalid amount (zero)
      await element(by.id('edit-tx-amount-input')).clearText();
      await element(by.id('edit-tx-amount-input')).typeText('0');

      // Try to save
      await helpers.waitAndTap('edit-tx-save-button');

      // Modal should still be visible (validation failed)
      await helpers.waitForElement('edit-tx-form');
    });

    it('should show validation error for negative amount', async () => {
      await helpers.waitForElement('treasury-transactions-list');

      // Tap edit button
      const editButton = element(by.id(/^edit-transaction-/)).atIndex(0);
      await editButton.tap();

      await helpers.waitForElement('edit-tx-form');

      // Enter invalid amount (negative)
      await element(by.id('edit-tx-amount-input')).clearText();
      await element(by.id('edit-tx-amount-input')).typeText('-50');

      // Try to save
      await helpers.waitAndTap('edit-tx-save-button');

      // Modal should still be visible (validation failed)
      await helpers.waitForElement('edit-tx-form');
    });

  });

  describe('Treasury Reports', () => {
    it('should navigate to generate report screen', async () => {
      await helpers.waitAndTap('treasury-generate-report-button');
      // Verify navigation (specific testID depends on report screen implementation)
      await waitFor(element(by.text('Generate Report')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should show saved reports button', async () => {
      await helpers.waitForElement('treasury-saved-reports-button');
    });
  });
});
