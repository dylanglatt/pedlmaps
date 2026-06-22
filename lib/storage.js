import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage works on iOS/Android and falls back to localStorage on web,
// so a single wrapper covers every platform.
const KEY = 'citibike.saved.v1';

// Shape: { homeId: string|null, workId: string|null }
export async function loadSaved() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { homeId: null, workId: null };
  } catch {
    return { homeId: null, workId: null };
  }
}

export async function saveSaved(saved) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // ignore write errors (private mode, etc.)
  }
}
