// Google Cloud Text-to-Speech: synthesize a line of guidance to a cached MP3 and
// return its local file uri (for expo-audio to play). Reuses the same Google key
// as Maps (EXPO_PUBLIC_GOOGLE_MAPS_KEY). Pure-ish: the only native dependency is
// expo-file-system, required lazily so this module is safe to import on web and
// degrades to null (caller falls back to on-device speech) when it's unavailable.
import { GOOGLE_API_KEY, VOICE } from './config';

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const DIR_NAME = 'pedl-tts';

// The classic functional file API (cacheDirectory + writeAsStringAsync) lives at
// the /legacy subpath in expo-file-system 54+. The main module only re-exports a
// few deprecated function shims WITHOUT cacheDirectory, so require legacy directly
// (literal paths — Metro can't resolve a dynamic require).
let _fs;
function usable(m) {
  return !!(m && m.writeAsStringAsync && (m.cacheDirectory || m.documentDirectory));
}
function fs() {
  if (_fs !== undefined) return _fs;
  _fs = null;
  try { const m = require('expo-file-system/legacy'); if (usable(m)) { _fs = m; return _fs; } } catch {}
  try { const m = require('expo-file-system'); if (usable(m)) { _fs = m; return _fs; } } catch {}
  return _fs;
}
function baseDir(F) {
  return F.cacheDirectory || F.documentDirectory;
}

// True when synthesis is wired up (key present + a file system to cache into).
export function available() {
  return !!(VOICE.useGoogle && GOOGLE_API_KEY && fs() && baseDir(fs()));
}

// Tiny stable hash (djb2) so identical lines reuse the same cached file.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function ensureDir(F) {
  const dir = `${baseDir(F)}${DIR_NAME}/`;
  try {
    const info = await F.getInfoAsync(dir);
    if (!info.exists) await F.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
  return dir;
}

// Synthesize `text` and return a local file uri, or null on any failure (so the
// caller can fall back to on-device speech). Cached: a second call for the same
// text + voice is a no-op disk lookup, which is what makes screen-off/offline
// playback work once the route's cues have been warmed at GO.
export async function synthesize(text) {
  const F = fs();
  if (!available() || !text) return null;
  const voice = VOICE.googleVoice;
  const rate = VOICE.rate || 1.0;
  const path = `${await ensureDir(F)}${hash(`${voice}|${rate}|${text}`)}.mp3`;

  try {
    const info = await F.getInfoAsync(path);
    if (info.exists && info.size > 0) return path; // cache hit
  } catch {}

  const body = {
    input: { text },
    voice: { languageCode: VOICE.lang || 'en-US', name: voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
  };
  const res = await fetch(`${ENDPOINT}?key=${GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const json = await res.json();
  if (!json.audioContent) throw new Error('tts: empty audio');

  await F.writeAsStringAsync(path, json.audioContent, { encoding: 'base64' });
  return path;
}

// Exposed for unit testing the request shape without hitting the network.
export function _buildBody(text) {
  return {
    input: { text },
    voice: { languageCode: VOICE.lang || 'en-US', name: VOICE.googleVoice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: VOICE.rate || 1.0 },
  };
}
export { hash as _hash };
