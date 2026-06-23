// Pick an icon for a saved place. Home/Work go by type; custom places try to
// match a category from their nickname (e.g. "Gym" -> dumbbell), else a pin.
// Icon names map to SF Symbols / Ionicons in components/Icon.js.

const KEYWORDS = [
  [['gym', 'fitness', 'workout', 'crossfit', 'yoga', 'pilates', 'equinox'], 'gym'],
  [['coffee', 'cafe', 'café', 'starbucks', 'espresso', 'roasters'], 'coffee'],
  [['school', 'class', 'university', 'college', 'campus', 'nyu', 'library'], 'school'],
  [['restaurant', 'dinner', 'lunch', 'food', 'diner', 'pizza', 'sushi', 'deli'], 'food'],
  [['store', 'shop', 'grocery', 'market', 'mall', 'target', 'costco', 'trader'], 'shop'],
  [['bar', 'pub', 'drinks', 'brewery', 'cocktail', 'tavern', 'lounge'], 'bar'],
  [['park', 'garden', 'field', 'green'], 'park'],
  [['doctor', 'clinic', 'hospital', 'dentist', 'medical', 'therapist', 'pharmacy'], 'medical'],
  [['mom', 'dad', 'parents', 'family', 'grandma', 'grandpa', 'friend', 'sister', 'brother', "'s"], 'person'],
  [['airport', 'jfk', 'lga', 'laguardia', 'newark', 'ewr', 'terminal'], 'airport'],
  [['train', 'station', 'subway', 'penn', 'grand central', 'path', 'ferry'], 'transit'],
];

export function iconForPlace(place) {
  if (!place) return 'pin';
  if (place.type === 'home') return 'home';
  if (place.type === 'work') return 'work';
  const n = (place.nickname || '').toLowerCase();
  for (const [keys, icon] of KEYWORDS) {
    if (keys.some((k) => n.includes(k))) return icon;
  }
  return 'pin';
}

// Which color family the tile circle should use.
// 'home' | 'work' | 'category' (matched a keyword) | 'pin' (generic)
export function tileColorKey(place) {
  if (!place) return 'pin';
  if (place.type === 'home') return 'home';
  if (place.type === 'work') return 'work';
  return iconForPlace(place) === 'pin' ? 'pin' : 'category';
}
