/**
 * Expo Config Plugin: AppDelegate CallId UUID Validation
 *
 * iOS CallKit requires proper UUID format for callId.
 * This plugin patches AppDelegate.swift to validate callId from VoIP push
 * and generate a fallback UUID if the format is invalid.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withCallIdValidation(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appDelegatePath = path.join(
        projectRoot,
        'ios',
        config.modRequest.projectName,
        'AppDelegate.swift'
      );

      if (!fs.existsSync(appDelegatePath)) {
        console.warn('[withCallIdValidation] AppDelegate.swift not found, skipping');
        return config;
      }

      let content = fs.readFileSync(appDelegatePath, 'utf-8');

      // Check if already patched
      if (content.includes('UUID(uuidString: payloadCallId)')) {
        console.log('[withCallIdValidation] Already patched, skipping');
        return config;
      }

      // Find the old pattern and replace with validated version
      const oldPattern = `  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    print("[Whisper] VoIP Push received with payload: \\(payload.dictionaryPayload)")

    // CRITICAL: Use callId from payload as UUID for consistency between native and JS
    // This ensures the same UUID is used when CallKit reports the call and when JS manages it
    let callId = payload.dictionaryPayload["callId"] as? String ?? UUID().uuidString.lowercased()
    let fromWhisperId = payload.dictionaryPayload["fromWhisperId"] as? String ?? "Unknown"
    let callerName = payload.dictionaryPayload["callerName"] as? String ?? fromWhisperId
    let hasVideo = payload.dictionaryPayload["isVideo"] as? Bool ?? false

    print("[Whisper] Reporting incoming call - callId: \\(callId), from: \\(fromWhisperId), video: \\(hasVideo)")`;

      const newPattern = `  public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
    print("[Whisper] VoIP Push received with payload: \\(payload.dictionaryPayload)")

    // CRITICAL: Validate callId is a proper UUID format - iOS CallKit crashes if invalid
    var callId: String
    if let payloadCallId = payload.dictionaryPayload["callId"] as? String,
       UUID(uuidString: payloadCallId) != nil {
      callId = payloadCallId
    } else {
      callId = UUID().uuidString.lowercased()
      print("[Whisper] Invalid or missing callId, generated fallback: \\(callId)")
    }

    let fromWhisperId = payload.dictionaryPayload["fromWhisperId"] as? String ?? "Unknown"
    let callerName = payload.dictionaryPayload["callerName"] as? String ?? fromWhisperId
    let hasVideo = payload.dictionaryPayload["isVideo"] as? Bool ?? false

    print("[Whisper] Reporting incoming call - callId: \\(callId), from: \\(fromWhisperId), video: \\(hasVideo)")`;

      if (content.includes(oldPattern)) {
        content = content.replace(oldPattern, newPattern);
        fs.writeFileSync(appDelegatePath, content);
        console.log('[withCallIdValidation] Successfully patched AppDelegate for UUID validation');
      } else {
        console.warn('[withCallIdValidation] Could not find pattern to patch - may need manual update');
      }

      return config;
    },
  ]);
}

module.exports = withCallIdValidation;
