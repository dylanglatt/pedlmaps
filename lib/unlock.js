import { Linking, Platform } from 'react-native';

// Resolve the HTTPS link we hand the OS to unlock a bike. The link is SOURCED FROM
// GBFS (each station's `rental_uris`), never a hardcoded city app URL — this is what
// keeps the feature city-agnostic and inside the official-sources principle. Order:
//   1. rider prefers Lyft AND this system is Lyft-run (has a `lyftLink`) → Lyft
//   2. the station's own GBFS `rental_uris` universal link (operator app; the OS
//      falls back to the website / App Store when the app isn't installed)
//   3. no `rental_uris` on the station → the system's `appStoreUrl`, else its `web`
//
// Universal/HTTPS links only — no undocumented custom scheme, nothing to declare in
// Info.plist, no `canOpenURL` (so it stays OTA-safe). Pure + synchronous, so it's
// trivial to unit-test. `platform` selects the platform-specific rental_uri and
// defaults to iOS (the primary target); NYC's feed carries identical ios/android
// links today, but honoring the split keeps us correct as feeds diverge.
export function resolveUnlockUrl(station, system, preferLyft, platform = 'ios') {
  if (preferLyft && system && system.lyftLink) return system.lyftLink;
  const uris = station && station.rentalUris;
  if (uris) {
    const link = uris[platform] || uris.ios || uris.android || uris.web;
    if (link) return link;
  }
  return (system && (system.appStoreUrl || system.web)) || null;
}

// Fire the hand-off: resolve the link, then open it. Any failure is swallowed —
// there's no better fallback than the universal link itself, since the OS already
// routes it to the web / App Store when the target app is missing.
export async function openUnlock(station, system, preferLyft) {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  const url = resolveUnlockUrl(station, system, preferLyft, platform);
  if (!url) return;
  try { await Linking.openURL(url); } catch {}
}
