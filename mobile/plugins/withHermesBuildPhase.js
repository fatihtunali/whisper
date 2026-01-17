const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withHermesBuildPhase(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');

        // Add code to fix Hermes script phase in post_install
        const hermesFixCode = `
    # Fix Hermes script phase warning
    installer.pods_project.targets.each do |target|
      target.build_phases.each do |phase|
        if phase.is_a?(Xcodeproj::Project::Object::PBXShellScriptBuildPhase) && phase.name&.include?('Hermes')
          phase.output_paths = ['$(DERIVED_FILE_DIR)/hermes-setup-done'] if phase.output_paths.empty?
          phase.always_out_of_date = '0'
        end
      end
    end`;

        // Check if already patched
        if (!podfileContent.includes('Fix Hermes script phase warning')) {
          // Insert before the closing 'end' of post_install block
          podfileContent = podfileContent.replace(
            /(\s*)(react_native_post_install\([^)]+\))\s*\n(\s*)end\s*\nend/,
            `$1$2${hermesFixCode}\n$3end\nend`
          );

          fs.writeFileSync(podfilePath, podfileContent);
          console.log('[withHermesBuildPhase] Podfile patched to fix Hermes warning');
        }
      }

      return config;
    },
  ]);
};
