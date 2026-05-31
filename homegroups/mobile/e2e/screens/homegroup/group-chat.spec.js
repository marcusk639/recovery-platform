const helpers = require('../../helpers');

async function navigateToGroupChat() {
  await element(by.text('Home')).tap();
  await helpers.waitForElement('group-list-screen');
  await element(by.id('group-list')).atIndex(0).tap();
  await helpers.waitForElement('group-info-section');
  await helpers.waitAndTap('group-overview-chat-tile');
  await helpers.waitForElement('chat-message-list');
}

describe('Group Chat Screen', () => {
  beforeAll(async () => {
    await device.launchApp({newInstance: true});
    try {
      await waitFor(element(by.id('landing-signin-button'))).toBeVisible().withTimeout(5000);
      await element(by.id('landing-signin-button')).tap();
    } catch (e) {}
    await helpers.login();
  });

  beforeEach(async () => {
    await navigateToGroupChat();
  });

  it('should display the chat message list', async () => {
    await helpers.waitForElement('chat-message-list');
  });

  it('should show message input and send button', async () => {
    await helpers.waitForElement('chat-message-input');
    await helpers.waitForElement('chat-send-button');
  });

  it('should show attach button', async () => {
    await helpers.waitForElement('chat-attach-button');
  });

  it('should send a text message', async () => {
    const testMessage = 'Hello from e2e test ' + Date.now();
    await helpers.waitAndType('chat-message-input', testMessage);
    await helpers.waitAndTap('chat-send-button');
    // Input clears after send
    await waitFor(element(by.id('chat-message-input')))
      .toHaveText('')
      .withTimeout(3000);
  });

  it('should open reply mode when long-pressing a message', async () => {
    // Long-press the first individual message bubble (testID: chat-message-<id>)
    await waitFor(element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0).longPress();
    await waitFor(element(by.id('chat-message-option-reply')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.id('chat-message-option-reply')).tap();
    await waitFor(element(by.id('chat-replying-to-banner')))
      .toBeVisible()
      .withTimeout(3000);
  });

  it('should cancel reply mode', async () => {
    await waitFor(element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0).longPress();
    await waitFor(element(by.id('chat-message-option-reply')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.id('chat-message-option-reply')).tap();
    await waitFor(element(by.id('chat-replying-to-banner')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.id('chat-cancel-reply-button')).tap();
    await waitFor(element(by.id('chat-replying-to-banner')))
      .not.toBeVisible()
      .withTimeout(3000);
  });

  it('should send a reply message', async () => {
    await waitFor(element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id(/^chat-message-[0-9A-Za-z]/)).atIndex(0).longPress();
    await waitFor(element(by.id('chat-message-option-reply')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.id('chat-message-option-reply')).tap();
    await waitFor(element(by.id('chat-replying-to-banner')))
      .toBeVisible()
      .withTimeout(3000);
    const replyMessage = 'Reply from e2e test ' + Date.now();
    await helpers.waitAndType('chat-message-input', replyMessage);
    await helpers.waitAndTap('chat-send-button');
    await waitFor(element(by.id('chat-message-input')))
      .toHaveText('')
      .withTimeout(3000);
  });
});
