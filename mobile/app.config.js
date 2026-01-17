/**
 * Expo dynamic configuration
 * This allows us to use EAS file environment variables for google-services.json
 *
 * During EAS builds, the GOOGLE_SERVICES_JSON env var contains the path to the uploaded file
 * During local development, it falls back to the placeholder file
 */
module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      // Use EAS file environment variable if available, otherwise fallback to local file
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
    },
  };
};
