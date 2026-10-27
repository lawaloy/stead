const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { FileStore } = require('metro-cache');
const path = require('node:path');

const config = getSentryExpoConfig(__dirname);

config.cacheStores = [
  new FileStore({ root: path.join(__dirname, '.cache', 'metro') }),
];
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
