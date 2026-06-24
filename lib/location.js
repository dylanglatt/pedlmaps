import { Platform } from 'react-native';

// Default center if location is denied/unavailable: Midtown Manhattan.
export const DEFAULT_CENTER = { lat: 40.7484, lon: -73.9857 };

// Cross-platform current location.
// - web: browser geolocation
// - native (iOS/Android): expo-location
// Always resolves; never throws.
//
// Returns { lat, lon, status, fallback }:
//   status   'granted' | 'denied' | 'unavailable'
//   fallback true when lat/lon are DEFAULT_CENTER because we couldn't get a real
//            fix (denied permission, no geolocation, or an error). Callers that
//            only read lat/lon keep working — the extra fields are additive.
export async function getLocation() {
  try {
    if (Platform.OS === 'web') {
      return await new Promise((resolve) => {
        if (!navigator.geolocation) {
          return resolve({ ...DEFAULT_CENTER, status: 'unavailable', fallback: true });
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, status: 'granted', fallback: false }),
          (err) => resolve({ ...DEFAULT_CENTER, status: err && err.code === 1 ? 'denied' : 'unavailable', fallback: true }),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { ...DEFAULT_CENTER, status: status === 'denied' ? 'denied' : 'unavailable', fallback: true };
    }
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, status: 'granted', fallback: false };
  } catch {
    return { ...DEFAULT_CENTER, status: 'unavailable', fallback: true };
  }
}

// Subscribe to live position updates for the user-location dot. Does NOT prompt
// (getLocation already did) — if permission isn't granted it just no-ops. Returns
// an unsubscribe function. Foreground/browse use, so accuracy is balanced to save
// battery (turn-by-turn nav uses its own high-accuracy watch in voiceNav).
export async function watchLocation(onUpdate) {
  try {
    if (Platform.OS === 'web') {
      if (!navigator.geolocation) return () => {};
      const id = navigator.geolocation.watchPosition(
        (pos) => onUpdate({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
      return () => navigator.geolocation.clearWatch(id);
    }
    const Location = await import('expo-location');
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return () => {};
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 8 },
      (pos) => onUpdate({ lat: pos.coords.latitude, lon: pos.coords.longitude })
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
