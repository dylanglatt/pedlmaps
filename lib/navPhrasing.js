// Turn raw routing-provider maneuver text into natural, TTS-friendly cycling
// instructions. Provider-agnostic and pure (no React Native imports) so it can
// be unit-tested with plain node.
//
// The biggest spoken-clarity win is expanding street-type abbreviations: many
// TTS voices read "St" as "Saint", "Ave" oddly, "Blvd"/"Pkwy" letter-by-letter.
// We expand the common suffixes, with a special case so a *leading* "St" (as in
// "St Marks Pl" or "St Nicholas Ave") becomes "Saint", not "Street".

const SUFFIX = [
  ['Ave', 'Avenue'],
  ['Blvd', 'Boulevard'],
  ['Rd', 'Road'],
  ['Dr', 'Drive'],
  ['Pkwy', 'Parkway'],
  ['Hwy', 'Highway'],
  ['Expy', 'Expressway'],
  ['Fwy', 'Freeway'],
  ['Sq', 'Square'],
  ['Pl', 'Place'],
  ['Plz', 'Plaza'],
  ['Ln', 'Lane'],
  ['Ter', 'Terrace'],
  ['Ct', 'Court'],
  ['Cir', 'Circle'],
];

function expandStreetWords(s) {
  let out = s;
  // Leading "St " before a capitalized word == "Saint" (St Marks Pl, St Nicholas Ave).
  out = out.replace(/\bSt\.?\s+(?=[A-Z])/g, 'Saint ');
  // Otherwise a standalone "St" is the "Street" suffix.
  out = out.replace(/\bSt\b\.?/g, 'Street');
  for (const [abbr, full] of SUFFIX) {
    out = out.replace(new RegExp(`\\b${abbr}\\b\\.?`, 'g'), full);
  }
  return out;
}

// Public: rewrite one maneuver instruction for speaking + display.
export function phrase(instruction) {
  if (!instruction) return instruction;
  let s = String(instruction);

  // Light cleanups of provider verbosity.
  s = s
    .replace(/\bContinue to follow\b/gi, 'Continue on')
    .replace(/\bProceed to\b/gi, 'Head to')
    .replace(/\s*\(.*?\)\s*/g, ' ') // drop parenthetical asides like "(restricted usage road)"
    .replace(/\s+/g, ' ')
    .trim();

  s = expandStreetWords(s);

  // Tidy spacing/punctuation and ensure it ends as a sentence.
  s = s.replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim();
  if (s && !/[.!?]$/.test(s)) s += '.';
  return s;
}

// Public: arrival bookend that names the place when we have one.
export function arrivalLine(placeName) {
  const name = (placeName || '').trim();
  return name ? `You've arrived at ${name}.` : 'You have arrived.';
}
