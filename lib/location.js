import { Platform } from 'react-native';

// Default center if location is denied/unavailable: Midtown Manhattan.
export const DEFAULT_CENTER = { lat: 40.7484, lon: -73.9857 };

// Cross-platform current location.
// - web: browser geolocation
// - native (iOS/Android): expo-location
// Always resolves; falls back to DEFAULT_CENTER on error/denial.
export async function getLocation() {
  try {
    if (Platform.OS === 'web') {
      return await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(DEFAULT_CENTER);
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve(DEFAULT_CENTER),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return DEFAULT_CENTER;
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return DEFAULT_CENTER;
  }
}
