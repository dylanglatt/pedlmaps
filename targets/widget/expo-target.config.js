/**
 * Apple-targets config for the Pedl favorite-stations home-screen widget.
 *
 * This file is read by the `@bacons/apple-targets` config plugin at prebuild
 * time to generate a WidgetKit extension target. Because this is a managed/CNG
 * project (`ios/` is gitignored and regenerated), all native widget config lives
 * here — never hand-edit the generated Xcode project.
 *
 * The App Group is mirrored from the main app's entitlement (app.json
 * `ios.entitlements`) so the app and the widget share the same container.
 *
 * @param {{ ios: { entitlements: Record<string, any> } }} config resolved Expo config
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'PedlWidget',
  icon: '../../assets/icon.png',
  // iOS 17+ for AppIntentConfiguration (configurable widgets). See widget-spec.md.
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
