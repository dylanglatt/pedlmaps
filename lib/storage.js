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

// Recent destinations: array of { label, lat, lon }, most-recent first.
const RECENTS_KEY = 'dockhop.recents.v1';

export async function loadRecents() {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addRecent(place) {
  try {
    const cur = await loadRecents();
    const key = (p) => `${p.name || p.label || ''}|${p.address || ''}`;
    const deduped = cur.filter((p) => key(p) !== key(place));
    const next = [place, ...deduped].slice(0, 8);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
