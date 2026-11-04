import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

// "Always" location, explained before iOS asks. Voice nav keeps speaking with the
// screen off only when background location is granted; without it nav still works
// in the foreground. We show a short explainer first (Apple expects the reason to
// be clear in the UI) and don't re-nag a rider who said "Not now" recently.
const SNOOZE_KEY = 'pedl.bgLocationSnooze.v1'; // new key; never rename dockhop.* keys
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

function confirm(title, message, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// Returns true when background location is granted (after asking, if appropriate).
export async function ensureBackgroundPermission() {
  if (Platform.OS === 'web') return false;
  try {
    const cur = await Location.getBackgroundPermissionsAsync();
    if (cur.status === 'granted') return true;
    if (cur.canAskAgain === false) return false;
    let snoozedAt = 0;
    try { snoozedAt = Number(await AsyncStorage.getItem(SNOOZE_KEY)) || 0; } catch {}
    if (Date.now() - snoozedAt < SNOOZE_MS) return false;
    const ok = await confirm(
      'Keep directions on with the screen off?',
      'Pedl uses "Always" location only during a route, so spoken directions keep working when your phone is locked or in your pocket. On the next prompt, choose "Change to Always Allow" or "Allow While Using App" then enable Always in Settings.',
      'Continue',
      'Not now',
    );
    if (!ok) {
      try { await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {}
      return false;
    }
    const res = await Location.requestBackgroundPermissionsAsync();
    return res.status === 'granted';
  } catch {
    return false;
  }
}
