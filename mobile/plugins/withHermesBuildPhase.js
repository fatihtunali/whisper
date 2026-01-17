const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withHermesBuildPhase(config) {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const buildPhases = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase || {};

    for (const key in buildPhases) {
      const phase = buildPhases[key];
      if (phase && typeof phase === 'object' && phase.name) {
        const phaseName = phase.name.replace(/"/g, '');
        if (phaseName.includes('Hermes') && phaseName.includes('Replace')) {
          // Add dummy output to prevent "run every build" warning
          if (!phase.outputPaths || phase.outputPaths.length === 0) {
            phase.outputPaths = ['"$(DERIVED_FILE_DIR)/hermes-setup-complete"'];
          }
          // Set alwaysOutOfDate to 0 (based on dependency analysis)
          phase.alwaysOutOfDate = 0;
        }
      }
    }

    return config;
  });
};
