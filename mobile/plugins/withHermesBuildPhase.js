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

        // Check if already patched
        if (podfileContent.includes('Fix Hermes script phase warning')) {
          console.log('[withHermesBuildPhase] Podfile already patched');
          return config;
        }

        // Add code to fix Hermes script phase in post_install
        const hermesFixCode = `
    # Fix Hermes script phase warning
    installer.pods_project.targets.each do |target|
      target.build_phases.each do |phase|
        if phase.is_a?(Xcodeproj::Project::Object::PBXShellScriptBuildPhase) && phase.name&.include?('Hermes')
          phase.output_paths ||= []
          phase.output_paths << '$(DERIVED_FILE_DIR)/hermes-setup-done' if phase.output_paths.empty?
          phase.always_out_of_date = '0'
        end
      end
    end
  end
end`;

        // Replace the last "end\nend" with our fix + end\nend
        const lastEndPattern = /(\s+)end\nend\s*$/;
        if (lastEndPattern.test(podfileContent)) {
          podfileContent = podfileContent.replace(lastEndPattern, hermesFixCode + '\n');
          fs.writeFileSync(podfilePath, podfileContent);
          console.log('[withHermesBuildPhase] Podfile patched to fix Hermes warning');
        } else {
          console.log('[withHermesBuildPhase] Could not find pattern to patch in Podfile');
        }
      }

      return config;
    },
  ]);
};
