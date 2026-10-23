/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: { config: 'e2e/jest.config.cjs' },
    retries: 0,
    jest: { setupTimeout: 90000 },
  },
  apps: {
    stead: { type: 'ios.app', binaryPath: process.env.STEAD_DETOX_APP },
  },
  devices: {
    owned: {
      type: 'ios.simulator',
      device: { id: process.env.STEAD_DETOX_DEVICE },
      headless: true,
    },
  },
  configurations: { 'ios.pilot': { device: 'owned', app: 'stead' } },
  behavior: {
    launchApp: 'manual',
    init: { reinstallApp: true },
    cleanup: { shutdownDevice: false },
  },
  artifacts: {
    rootDir: process.env.STEAD_DETOX_ARTIFACTS,
    plugins: {
      log: 'all',
      screenshot: 'failing',
      video: 'none',
      instruments: 'none',
      uiHierarchy: 'disabled',
    },
  },
};
