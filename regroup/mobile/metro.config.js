const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * Matches homegroups/mobile/metro.config.js — both apps are React Native 0.72
 * and neither needs a custom resolver or transformer.
 *
 * This file was missing entirely until 2026-10-03, so `react-native bundle`
 * failed with "No Metro config found" and no release artifact could be built.
 * Same cause as the babel config: regroup/.gitignore excluded all JavaScript,
 * so the RN template's configs were never committed. Commit ea3ad4d restored
 * babel/jest/eslint but not this one.
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
