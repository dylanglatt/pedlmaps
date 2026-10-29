// Per-system overrides keyed by GBFS `system_id` (from system_information.json).
//
// GBFS already gives us everything we need to unlock a bike in the OPERATOR's own
// app: each station's `rental_uris` deep link (see lib/gbfs.js). That's sourced
// straight from the feed, so it's city-agnostic and official-sources-only — no
// hardcoded per-city app URL. The ONE thing GBFS can't encode is "open in Lyft
// instead": on Lyft-run networks a rider may prefer the Lyft app, which unlocks the
// very same bikes. That's a cross-system convenience, so it lives here as a small
// override table rather than in the feed.
//
// Only Lyft-operated networks get a non-null `lyftLink`. A system absent from this
// table simply has no Lyft option (the UI hides the escape hatch). `appStoreUrl` /
// `web` are last-ditch fallbacks, used by resolveUnlockUrl ONLY when a station has
// no `rental_uris` of its own. Everything here is an HTTPS universal link — no
// custom scheme, nothing to declare in Info.plist. See docs/unlock-plan.md.
export const SYSTEMS = {
  lyft_nyc: {
    id: 'lyft_nyc',
    name: 'Citi Bike',       // display name; mirrors system_information.name
    // Lyft app scan-to-unlock deep link. MUST be a path the Lyft app *claims* in its
    // apple-app-site-association (e.g. /lastmile_qr_scan) — the bare homepage's "/" is
    // excluded there, so it would open the website instead of the app. This path lives
    // only on lyft.com (not citibikenyc.com), so it forces the Lyft app even when the
    // Citi Bike app is also installed. Lyft runs Citi Bike, so it unlocks the same bikes.
    lyftLink: 'https://www.lyft.com/lastmile_qr_scan',
    appStoreUrl: 'https://apps.apple.com/us/app/citi-bike/id641194843',
    web: 'https://citibikenyc.com',
  },
};

// The GBFS system this build currently loads. Single-feed for now — lib/gbfs.js
// pulls only the NYC Citi Bike `bkn` feed, whose system_id is `lyft_nyc`. Serving
// other cities means loading more feeds and tagging each station with its own
// system_id; that's the forward-compat data task in docs/unlock-plan.md, not this
// change. Keeping it a named constant is what makes that a data edit, not a rewrite.
export const CURRENT_SYSTEM_ID = 'lyft_nyc';

// Look up the override object for a GBFS system_id (null if we have no entry).
export const systemFor = (id) => SYSTEMS[id] || null;
