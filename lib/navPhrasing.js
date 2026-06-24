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
  // "St" == "Saint" ONLY when it starts a street name (right after on/onto/toward/
  // along/up/down + a capitalized word), e.g. "onto St Marks Pl". This is scoped so
  // it can never fire mid-sentence (e.g. "...11th St. Destination" stays "Street").
  out = out.replace(/\b(on|onto|toward|towards|along|up|down)\s+St\.?\s+(?=[A-Z])/gi, '$1 Saint ');
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
    // Drop "Destination will be on the right" / "Your destination is on the left" —
    // we speak our own arrival cue, and this tail was colliding with St -> Saint.
    .replace(/[,.]?\s*(your )?destination (will be|is) on (the )?(left|right)\b.*$/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ') // drop parenthetical asides like "(restricted usage road)"
    .replace(/\s+/g, ' ')
    .trim();

  s = expandStreetWords(s);

  // Tidy spacing/punctuation. No trailing period — turn directions read cleaner
  // without one (matches Apple/Google maneuver cards).
  s = s.replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim();
  s = s.replace(/[.\s]+$/, '');
  return s;
}

// Public: arrival bookend that names the place when we have one.
export function arrivalLine(placeName) {
  const name = (placeName || '').trim();
  return name ? `You've arrived at ${name}.` : 'You have arrived.';
}

// Public: form an instruction to follow the word "Then" — lowercases the leading
// verb ("Turn left" -> "turn left") so "Then turn left" reads naturally. Leaves
// non-verb leads alone (e.g. "I-278", proper nouns) by only touching a plain
// Capitalized word.
export function continuation(instruction) {
  const s = String(instruction || '');
  const m = s.match(/^([A-Z][a-z]+)(\b[\s\S]*)$/);
  return m ? m[1].toLowerCase() + m[2] : s;
}

// Public: a shorter instruction for the narrow turn banner — drops the trailing
// "toward <cross-street>" clause. The full text is kept for speech + the steps list.
export function shortInstruction(instruction) {
  return String(instruction || '')
    .replace(/\s+toward\s+[^.,]+/i, '')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}
