// JS surface for the widget-bridge local Expo module. iOS-only; on web/Android
// (or if the native module isn't linked, e.g. Expo Go) every call is a safe
// no-op so callers don't need platform guards.
import { Platform } from 'react-native';

let native = null;
if (Platform.OS === 'ios') {
  try {
    // requireNativeModule throws if the module isn't present (e.g. Expo Go).
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('WidgetBridge');
  } catch {
    native = null;
  }
}

export const isWidgetBridgeAvailable = native != null;

// Write favorites to the App Group for the widget. `favorites` is an array of
// { id, name, shortName }. Serialized here; the native side just stores the string.
export function setFavorites(favorites) {
  if (!native) return;
  try {
    native.setFavorites(JSON.stringify(favorites ?? []));
  } catch {}
}

// Ask WidgetKit to refresh now (call after favorites change).
export function reloadWidget() {
  if (!native) return;
  try {
    native.reloadWidget();
  } catch {}
}

// Convenience: push the latest favorites and immediately reload the widget.
export function syncFavorites(favorites) {
  setFavorites(favorites);
  reloadWidget();
}
