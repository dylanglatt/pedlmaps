import { Linking, Platform } from 'react-native';
import { CITIBIKE } from './config';

// Hand off to the official Citi Bike app — the sanctioned place to view live
// e-bike battery and to unlock a bike. Tries the app's URL scheme first; if the
// app isn't installed (openURL rejects) we fall back to the platform app store,
// then the website. OTA-safe: no canOpenURL, so no LSApplicationQueriesSchemes /
// Info.plist change is needed.
export async function openCitiBike() {
  const store = Platform.OS === 'android' ? CITIBIKE.androidStore : CITIBIKE.iosStore;
  try {
    await Linking.openURL(CITIBIKE.scheme);
  } catch {
    try {
      await Linking.openURL(store);
    } catch {
      Linking.openURL(CITIBIKE.web).catch(() => {});
    }
  }
}
