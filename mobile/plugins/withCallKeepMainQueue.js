/**
 * Expo Config Plugin: Force RNCallKeep to use main queue
 *
 * iOS TurboModules run on background threads by default.
 * RNCallKeep interacts with CallKit which uses UIKit.
 * UIKit requires main thread - calling from background thread crashes.
 *
 * This plugin patches RNCallKeep.mm to use dispatch_get_main_queue().
 */

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withCallKeepMainQueue(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // Find RNCallKeep in node_modules
      const callKeepPath = path.join(
        projectRoot,
        'node_modules',
        'react-native-callkeep',
        'ios',
        'RNCallKeep'
      );

      // Try both .m and .mm extensions
      const possibleFiles = [
        path.join(callKeepPath, 'RNCallKeep.m'),
        path.join(callKeepPath, 'RNCallKeep.mm'),
      ];

      let targetFile = null;
      for (const file of possibleFiles) {
        if (fs.existsSync(file)) {
          targetFile = file;
          break;
        }
      }

      if (!targetFile) {
        console.warn('[withCallKeepMainQueue] RNCallKeep source file not found, skipping patch');
        return config;
      }

      let content = fs.readFileSync(targetFile, 'utf-8');

      // Check if already patched
      if (content.includes('methodQueue') && content.includes('dispatch_get_main_queue')) {
        console.log('[withCallKeepMainQueue] Already patched, skipping');
        return config;
      }

      // Check if methodQueue already exists
      if (content.includes('- (dispatch_queue_t)methodQueue')) {
        console.log('[withCallKeepMainQueue] methodQueue already exists, checking if it returns main queue');
        if (!content.includes('dispatch_get_main_queue()')) {
          console.warn('[withCallKeepMainQueue] methodQueue exists but does not use main queue - manual patch required');
        }
        return config;
      }

      // Find a safe insertion point - look for the first method definition after @implementation
      // Methods start with - or + followed by space and (
      // We need to insert BEFORE the first method, but AFTER any instance variable block { }

      const implementationMatch = content.match(/@implementation\s+RNCallKeep/);
      if (!implementationMatch) {
        console.warn('[withCallKeepMainQueue] Could not find @implementation RNCallKeep, skipping patch');
        return config;
      }

      const implIndex = implementationMatch.index + implementationMatch[0].length;
      const afterImpl = content.slice(implIndex);

      // Find the first method (starts with - or + at beginning of line, followed by space/paren)
      const firstMethodMatch = afterImpl.match(/\n[-+]\s*\(/);
      if (!firstMethodMatch) {
        console.warn('[withCallKeepMainQueue] Could not find first method in RNCallKeep, skipping patch');
        return config;
      }

      const methodQueueCode = `

// PATCHED BY withCallKeepMainQueue.js
// Force all RNCallKeep methods to run on main queue to prevent UIKit crashes
- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}
`;

      // Insert right before the first method
      const insertPosition = implIndex + firstMethodMatch.index;
      content = content.slice(0, insertPosition) + methodQueueCode + content.slice(insertPosition);

      fs.writeFileSync(targetFile, content);
      console.log('[withCallKeepMainQueue] Successfully patched RNCallKeep to use main queue');

      return config;
    },
  ]);
}

module.exports = withCallKeepMainQueue;
