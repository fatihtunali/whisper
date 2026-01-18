/**
 * Expo Config Plugin: Force InCallManager to use main queue
 *
 * iOS TurboModules run on background threads by default.
 * InCallManager may interact with AVAudioSession and UIKit.
 * This can cause crashes when called from background thread.
 *
 * This plugin patches InCallManager.m to use dispatch_get_main_queue().
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withInCallManagerMainQueue(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // Find InCallManager in node_modules
      const possiblePaths = [
        path.join(projectRoot, 'node_modules', 'react-native-incall-manager', 'ios', 'InCallManager.m'),
        path.join(projectRoot, 'node_modules', 'react-native-incall-manager', 'ios', 'RNInCallManager.m'),
        path.join(projectRoot, 'node_modules', 'react-native-incall-manager', 'ios', 'InCallManager', 'InCallManager.m'),
      ];

      let targetFile = null;
      for (const file of possiblePaths) {
        if (fs.existsSync(file)) {
          targetFile = file;
          break;
        }
      }

      if (!targetFile) {
        console.warn('[withInCallManagerMainQueue] InCallManager source file not found, skipping patch');
        return config;
      }

      let content = fs.readFileSync(targetFile, 'utf-8');

      // Check if already patched
      if (content.includes('// PATCHED BY withInCallManagerMainQueue')) {
        console.log('[withInCallManagerMainQueue] Already patched, skipping');
        return config;
      }

      // Find the @implementation line
      const implementationPattern = /@implementation\s+\w*InCallManager/;
      const match = content.match(implementationPattern);

      if (!match) {
        console.warn('[withInCallManagerMainQueue] Could not find @implementation, skipping patch');
        return config;
      }

      // Check if methodQueue already exists
      if (content.includes('- (dispatch_queue_t)methodQueue')) {
        console.log('[withInCallManagerMainQueue] methodQueue already exists, skipping');
        return config;
      }

      // Insert methodQueue method after @implementation
      const methodQueueCode = `
// PATCHED BY withInCallManagerMainQueue.js
// Force all InCallManager methods to run on main queue
- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}
`;

      const insertPosition = match.index + match[0].length;
      content = content.slice(0, insertPosition) + '\n' + methodQueueCode + content.slice(insertPosition);

      fs.writeFileSync(targetFile, content);
      console.log('[withInCallManagerMainQueue] Successfully patched InCallManager to use main queue');

      return config;
    },
  ]);
}

module.exports = withInCallManagerMainQueue;
