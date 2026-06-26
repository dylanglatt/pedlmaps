// Sentry's Metro config wraps Expo's default config to enable source-map upload,
// which is what turns minified production stack traces back into real file/function
// names. If you ever need custom Metro settings, extend `config` below — don't
// replace it, or you'll lose the Sentry instrumentation.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
