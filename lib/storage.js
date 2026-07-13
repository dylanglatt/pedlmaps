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

// Distance units preference: 'imperial' | 'metric'.
const UNITS_KEY = 'dockhop.units.v1';

export async function loadUnits() {
  try {
    const v = await AsyncStorage.getItem(UNITS_KEY);
    return v === 'metric' ? 'metric' : 'imperial';
  } catch {
    return 'imperial';
  }
}

export async function saveUnits(units) {
  try { await AsyncStorage.setItem(UNITS_KEY, units); } catch {}
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

const recentKey = (p) => `${p.name || p.label || ''}|${p.address || ''}`;

export async function addRecent(place) {
  try {
    const cur = await loadRecents();
    const deduped = cur.filter((p) => recentKey(p) !== recentKey(place));
    const next = [place, ...deduped].slice(0, 8);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export async function removeRecent(place) {
  try {
    const cur = await loadRecents();
    const next = cur.filter((p) => recentKey(p) !== recentKey(place));
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export async function clearRecents() {
  try { await AsyncStorage.removeItem(RECENTS_KEY); } catch {}
  return [];
}

// First-run flag: gates the welcome/permission primer so it shows only once.
const ONBOARDED_KEY = 'dockhop.onboarded.v1';

export async function loadOnboarded() {
  try { return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1'; } catch { return false; }
}

export async function saveOnboarded() {
  try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
}

// Citi Bike membership status, for the fare estimate: 'member' | 'nonmember'.
// Set once, remembered — your pricing is who you are, not a per-trip choice.
const MEMBERSHIP_KEY = 'dockhop.membership.v1';

export async function loadMembership() {
  try { return (await AsyncStorage.getItem(MEMBERSHIP_KEY)) === 'member' ? 'member' : 'nonmember'; } catch { return 'nonmember'; }
}

export async function saveMembership(v) {
  try { await AsyncStorage.setItem(MEMBERSHIP_KEY, v === 'member' ? 'member' : 'nonmember'); } catch {}
}

// Whether the rider prefers to unlock via Lyft rather than the network operator's
// own app. Stored as a boolean intent ('1'/'0') so it's system-agnostic — meaningful
// on any Lyft-run network, not just NYC. The old per-app values ('citibike'/'lyft',
// from before multi-system support) migrate transparently on read. The AsyncStorage
// KEY is intentionally unchanged so existing installs keep their saved choice.
const UNLOCK_APP_KEY = 'dockhop.unlockApp.v1';

export async function loadPreferLyft() {
  try {
    const v = await AsyncStorage.getItem(UNLOCK_APP_KEY);
    return v === '1' || v === 'lyft'; // '1' = new shape; 'lyft' = legacy → migrate
  } catch { return false; }
}

export async function savePreferLyft(preferLyft) {
  try { await AsyncStorage.setItem(UNLOCK_APP_KEY, preferLyft ? '1' : '0'); } catch {}
}
