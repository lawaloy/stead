const { fixupPluginRules } = require('@eslint/compat');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const patchedExpoConfig = (Array.isArray(expoConfig) ? expoConfig : [expoConfig]).map((config) => {
  if (!config.plugins) {
    return config;
  }

  const patchedPlugins = Object.fromEntries(
    Object.entries(config.plugins).map(([name, plugin]) => [name, fixupPluginRules(plugin)]),
  );

  return {
    ...config,
    plugins: patchedPlugins,
  };
});

module.exports = defineConfig([
  ...patchedExpoConfig,
  {
    ignores: ['dist/**'],
  },
]);
