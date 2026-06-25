import AsyncStorage from '@react-native-async-storage/async-storage';

// Favorite stations — docks you want to watch, distinct from saved PLACES (which
// are destinations). A favorite is just a station id; live counts come from GBFS
// each time. Powers the pinned "Favorites" at the top of Nearby and, later, the
// home-screen widget. Keep the dockhop.* prefix — renaming wipes users' data.
const KEY = 'dockhop.favstations.v1';

export async function loadFavStations() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveFavStations(ids) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(ids)); } catch {}
  return ids;
}

export const isFavStation = (ids, id) => Array.isArray(ids) && ids.includes(id);
