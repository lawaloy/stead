const { describe, it } = require('@jest/globals');
const { device, element, by, expect: expectUi, waitFor } = require('detox');
const { execFileSync } = require('node:child_process');

const step = async (name, operation) => {
  const started = Date.now();
  console.log(`[iOS pilot] START ${name}`);
  await operation();
  console.log(`[iOS pilot] PASS ${name} (${Date.now() - started} ms)`);
};
const visible = (target) => waitFor(target).toBeVisible().withTimeout(15000);

describe('Stead iOS framework compatibility (not the full financial journey)', () => {
  it('launches, types exact values, handles a native alert, and restores a session', async () => {
    await step('App launches without Detox injection', async () => {
      const output = execFileSync(
        'xcrun',
        ['simctl', 'launch', device.id, 'com.lawaloy.stead'],
        {
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      if (!/com\.lawaloy\.stead: \d+/.test(output))
        throw new Error(`Simulator did not return an app process: ${output}`);
      await device.terminateApp();
    });
    await step('Bundled app opens without Metro', async () => {
      await device.launchApp({ newInstance: true });
      await visible(element(by.text('Stead Login')));
      await expectUi(element(by.id('auth-phone'))).toHaveText('');
    });
    await step('Real keyboard entry and OTP sign-in', async () => {
      // No prefilled phone, setters, added typing delays, or typing retries.
      // Stock Detox 20.51.1 processes keyboard events 50 ms apart; this
      // compatibility check does not prove the fast-input RN race is fixed.
      await element(by.id('auth-phone')).typeText(
        process.env.STEAD_DETOX_PHONE,
      );
      await expectUi(element(by.id('auth-phone'))).toHaveText(
        process.env.STEAD_DETOX_PHONE_DISPLAY,
      );
      await element(by.id('auth-request-otp')).tap();
      await visible(element(by.id('auth-verify-otp')));
      await element(by.id('auth-verify-otp')).tap();
      await visible(element(by.id('nav-dashboard')));
    });
    await step('Controlled text field retains every character', async () => {
      await element(by.text('Account')).tap();
      await visible(element(by.text('Account and privacy')));
      const name = element(by.label('Display name'));
      await name.typeText('Detox keyboard 1234567890');
      await expectUi(name).toHaveText('Detox keyboard 1234567890');
      await element(by.id('screen-shell-scroll')).scroll(200, 'down');
    });
    await step('Native alert opens and cancels', async () => {
      const signOut = element(by.text('Sign out of all devices'));
      await waitFor(signOut)
        .toBeVisible()
        .whileElement(by.id('screen-shell-scroll'))
        .scroll(200, 'down');
      await signOut.tap();
      await visible(element(by.text('Sign out of all devices?')));
      await element(by.text('Cancel')).tap();
      await expectUi(
        element(by.text('Sign out of all devices?')),
      ).not.toBeVisible();
    });
    await step(
      'Signed-in process restart preserves SecureStore credentials',
      async () => {
        await device.terminateApp();
        // No reinstall, keychain reset, launch URL, or second OTP request.
        await device.launchApp({ newInstance: true });
        await visible(element(by.id('nav-dashboard')));
        await element(by.text('Account')).tap();
        await visible(
          element(by.text('+234' + process.env.STEAD_DETOX_PHONE.slice(1))),
        );
        await expectUi(element(by.text('Stead Login'))).not.toBeVisible();
      },
    );
  });
});
