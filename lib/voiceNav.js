import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { distanceMeters } from './geo';
import { NAV, VOICE } from './config';
import { approachPhrase, spokenManeuver } from './navPhrasing';
import * as tts from './ttsGoogle';

let setAudioModeAsync = null;
let createAudioPlayer = null;
try { ({ setAudioModeAsync, createAudioPlayer } = require('expo-audio')); } catch {}

const TASK = 'CITIBIKE_NAV_TASK';
const isWeb = Platform.OS === 'web';

// Dev-only trace, filterable in the Metro/Expo terminal by "[nav]".
const DEV = typeof __DEV__ === 'undefined' ? true : __DEV__;
const log = (...a) => { if (DEV) console.log('[nav]', ...a); };

// Singleton controller. On native, a background location task forwards locations
// here so guidance keeps speaking with the screen off. On web we fall back to a
// foreground position watch (no background task API in the browser).
class NavController {
  constructor() {
    this.reset();
    this._webWatch = null;
    this.muted = false;
  }

  setMuted(v) {
    this.muted = v;
    if (v) { this._flushQueue(); this._interrupt(); }
  }

  // Pick the best installed voice once per session: prefer an Enhanced/premium
  // en-US voice (Siri-quality, on-device) and fall back to the system default.
  // iOS only ships compact voices until the user downloads the better ones
  // (Settings → Accessibility → Spoken Content → Voices), so this is best-effort.
  async _resolveVoice() {
    if (this._voiceResolved) return;
    this._voiceResolved = true;
    // Manual override: once the log below shows you the installed voices, paste
    // the one you like into VOICE.voiceId and we use it verbatim.
    if (VOICE.voiceId) { this._voiceId = VOICE.voiceId; log('voice: override ->', this._voiceId); return; }
    try {
      const voices = (await Speech.getAvailableVoicesAsync()) || [];
      const lang = (VOICE.lang || 'en-US').toLowerCase();
      const Default = Speech.VoiceQuality?.Default ?? 'Default';
      const isEn = (v) => (v.language || '').toLowerCase().startsWith('en');
      const isLang = (v) => (v.language || '').toLowerCase() === lang;
      // "Better" = any non-default quality (covers both Enhanced and Premium).
      const better = (v) => v.quality && v.quality !== Default;
      const pick =
        voices.find((v) => isLang(v) && better(v)) ||
        voices.find((v) => isEn(v) && better(v)) ||
        voices.find((v) => isLang(v)) ||
        voices.find((v) => isEn(v)) ||
        null;
      this._voiceId = pick ? pick.identifier : null;

      // Dev diagnostics so we can see what's actually installed on the device:
      // how many high-quality English voices exist, and which one we chose.
      const betterEn = voices.filter((v) => isEn(v) && better(v));
      log(`voices: ${voices.length} installed, ${betterEn.length} enhanced/premium en`);
      betterEn.forEach((v) => log(`  hi-q en: ${v.name} [${v.identifier}] q=${v.quality}`));
      log('voice picked:', pick ? `${pick.name} [${pick.identifier}] q=${pick.quality}` : 'system default (none better installed)');
    } catch (e) {
      this._voiceId = null;
      log('voice resolve failed:', e && e.message);
    }
  }
  reset() {
    this.active = false;
    this.maneuvers = [];
    this.routeCoords = [];
    this.idx = 0;
    this.preAnnounced = false;     // advance cue spoken for the current turn
    this.lastReroute = 0;
    this._offHits = 0;             // consecutive off-route fixes
    this._rerouting = false;       // a reroute fetch is in flight (pause guidance)
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this._lastSaid = null;         // de-dupe: text of the last spoken cue
    this._lastSaidAt = 0;          // de-dupe: when we last spoke
    this.cb = {};
    // Waypoint-geofence state (leg boundaries: pickup/dock/stop/dest).
    this._wpIdx = -1;        // which maneuver index the geofence trackers belong to
    this._wpMin = Infinity;  // closest we've come to the current waypoint
    this._lastPos = null;    // last position used for stationary detection
    this._lastMoveAt = 0;    // timestamp we last meaningfully moved
    this._sayToken = 0;      // guards against a stale async cue playing late
    this._ttsReady = false;  // Google TTS usable this session (key + fs + player)
    // Serialized speech: exactly one cue plays at a time; the next waits for it to
    // actually finish, so clips can't overlap.
    this._queue = [];        // pending cues (freshest-wins for normal/low)
    this._active = null;     // token of the cue currently playing (null = idle)
    this._sub = null;        // expo-audio playback-status subscription
    if (this._cueTimer) { clearTimeout(this._cueTimer); this._cueTimer = null; }
    this._stopPlayback();
    this._clearPoll();
  }

  _clearPoll() {
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  }

  // While near a waypoint, location updates would otherwise stop the moment the
  // rider stops moving (distanceInterval gating), so the arrival check would
  // never re-run. Poll our own position to keep the geofence live when stopped.
  _armPoll() {
    if (isWeb || this._poll) return;
    log('poll armed (near waypoint)');
    this._poll = setInterval(async () => {
      if (!this.active) return;
      try {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
        this.onLocation(p);
      } catch {}
    }, NAV.pollMs);
  }

  // Robust arrival test for a tagged waypoint. Returns the reason it fired
  // ('radius' | 'passed' | 'parked') or null. Reason is logged so the smoke
  // test shows which path triggered.
  _waypointArrived(here, m) {
    const d = distanceMeters(here.lat, here.lon, m.location[0], m.location[1]);
    if (d <= NAV.arriveM) return 'radius';
    if (d < this._wpMin) this._wpMin = d;
    const cameClose = this._wpMin <= NAV.arriveZoneM;
    if (cameClose && d > this._wpMin + NAV.passSlackM) return 'passed';
    if (d <= NAV.arriveZoneM && Date.now() - this._lastMoveAt > NAV.stationaryMs) return 'parked';
    return null;
  }

  // Tear down the current audio output (both channels) without advancing the
  // queue. Removes the playback listener first so its "finished" event can't fire
  // a spurious advance after we've cut it.
  _stopPlayback() {
    if (this._sub) { try { this._sub.remove(); } catch {} this._sub = null; }
    if (this._player) {
      try { this._player.pause(); } catch {}
      try { this._player.remove(); } catch {}
      this._player = null;
    }
  }

  _flushQueue() { this._queue = []; }

  // Hard-stop the active cue (used by a high-priority interrupt or mute). Leaves
  // the queue alone; the caller decides what plays next.
  _interrupt() {
    if (this._cueTimer) { clearTimeout(this._cueTimer); this._cueTimer = null; }
    this._stopPlayback();
    Speech.stop();
    this._active = null;
  }

  // priority: 'high' (arrival/reroute/waypoint — interrupts and plays now),
  // 'normal' (a turn), 'low' (early heads-up). Normal/low cues NEVER cut off a cue
  // that's already playing — they queue, and only the freshest pending one is kept,
  // so a burst near a station can't stack clips on top of each other.
  say(text, opts = {}) {
    if (this.muted || !text) return;
    const now = Date.now();
    const prio = opts.priority || 'normal';
    if (prio === 'low' && now - this._lastSaidAt < NAV.minGapMs) { log('skip low cue:', text); return; }
    if (text === this._lastSaid && now - this._lastSaidAt < NAV.dedupeMs) { log('dedupe cue:', text); return; }
    const cue = { text, prio, token: ++this._sayToken };
    if (prio === 'high') {
      this._flushQueue();
      this._interrupt();          // cut whatever's playing; this cue wins immediately
      this._queue.push(cue);
    } else {
      // Drop stale pending normal/low cues (keep any queued high), enqueue this one.
      this._queue = this._queue.filter((c) => c.prio === 'high');
      this._queue.push(cue);
    }
    this._drain();
  }

  // Start the next cue only when nothing is currently playing — this is what
  // serializes audio and prevents overlap.
  _drain() {
    if (this._active || this.muted) return;
    const cue = this._queue.shift();
    if (!cue) return;
    this._active = cue.token;
    this._lastSaid = cue.text;
    this._lastSaidAt = Date.now();
    log('say:', cue.text);
    this._stopPlayback();
    Speech.stop();
    this._armCueTimer(cue.text, cue.token); // provisional backstop in case synth hangs
    if (!this._ttsReady) { this._speakDevice(cue.text, cue.token); return; }
    this._playLine(cue.text, cue.token); // prefer cached Google clip (re-arms timer)
  }

  // Called when the active cue finishes (or its safety timer fires). Advances the
  // queue. Ignores stale completions from a cue we already interrupted.
  _onCueDone(token) {
    if (token !== this._active) return;
    if (this._cueTimer) { clearTimeout(this._cueTimer); this._cueTimer = null; }
    this._active = null;
    this._drain();
  }

  // Backstop completion: if neither the audio "finished" event nor Speech's onDone
  // fires (API quirk, killed clip), advance anyway after a generous estimate so we
  // never wedge. Biased long so it can't cut a clip short and cause overlap.
  _armCueTimer(text, token) {
    if (this._cueTimer) clearTimeout(this._cueTimer);
    const words = String(text).trim().split(/\s+/).filter(Boolean).length || 1;
    const secs = (Math.max(1.4, words / 2.4) / (VOICE.rate || 1)) * 1.8 + 1.2;
    this._cueTimer = setTimeout(() => this._onCueDone(token), secs * 1000);
  }

  _speakDevice(text, token) {
    Speech.stop();
    Speech.speak(text, {
      rate: VOICE.rate,
      pitch: VOICE.pitch,
      ...(this._voiceId ? { voice: this._voiceId } : {}),
      onDone: () => this._onCueDone(token),
      onStopped: () => this._onCueDone(token),
      onError: () => this._onCueDone(token),
    });
    this._armCueTimer(text, token);
  }

  async _playLine(text, token) {
    try {
      const uri = await tts.synthesize(text);
      if (token !== this._active) return; // superseded/interrupted before play
      if (uri && createAudioPlayer) {
        this._stopPlayback();
        const p = createAudioPlayer(uri);
        this._player = p;
        try {
          this._sub = p.addListener('playbackStatusUpdate', (s) => {
            if (s && s.didJustFinish) this._onCueDone(token);
          });
        } catch {}
        p.play();
        this._armCueTimer(text, token);
        return;
      }
    } catch (e) {
      log('tts failed, using device voice:', e && e.message);
    }
    if (token === this._active) this._speakDevice(text, token); // fallback
  }

  // Synthesize every cue up front (at GO, while stationary with signal) so later
  // cues play instantly and keep working in dead zones. Sequential + best-effort.
  async _warmCache() {
    if (!this._ttsReady) return;
    for (const m of this.maneuvers) {
      if (!this.active) return;
      try { await tts.synthesize(m.instruction); } catch {}
    }
  }

  async start({ maneuvers, routeCoords, intro, onProgress, onReroute, onArrive, onLocationUpdate }) {
    this.reset();
    this.maneuvers = maneuvers || [];
    this.routeCoords = routeCoords || [];
    this.cb = { onProgress, onReroute, onArrive, onLocationUpdate };
    this.active = true;

    await this._resolveVoice(); // choose the best on-device voice (fallback path)
    this._ttsReady = !!(createAudioPlayer && tts.available());
    log('tts:', this._ttsReady ? `google (${VOICE.googleVoice})` : 'on-device');

    // Trace the geofence targets so the smoke test can teleport to each in turn.
    this.maneuvers.forEach((mv, i) => {
      if (mv.kind) log(`waypoint[${i}] ${mv.kind}: ${mv.location[0].toFixed(5)},${mv.location[1].toFixed(5)}  "${mv.instruction}"`);
    });

    // Play spoken guidance over the silent switch + duck music (like Apple Maps).
    if (setAudioModeAsync && Platform.OS !== 'web') {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true });
      } catch {}
    }

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') throw new Error('Location permission needed for navigation.');

    if (isWeb) {
      // Foreground watch (works while the tab is open).
      this._webWatch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 5 },
        (loc) => this.onLocation(loc)
      );
    } else {
      // Background permission lets it keep guiding with the screen off (best-effort).
      try { await Location.requestBackgroundPermissionsAsync(); } catch {}
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1500,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: 'Pedl navigation',
          notificationBody: 'Guiding you to your dock',
        },
      });
    }
    if (this.maneuvers[0]) {
      const opening = `${intro ? intro + ' ' : ''}${spokenManeuver(this.maneuvers[0].instruction)}`.trim();
      this.say(opening);
      this.cb.onProgress && this.cb.onProgress({ maneuver: this.maneuvers[0], next: this.maneuvers[1] || null, distance: Infinity, index: 0 });
      // We just spoke the departure cue; start tracking the first real turn so the
      // opening fix (standing right on maneuver 0) can't re-announce it.
      if (!this.maneuvers[0].kind) this.idx = 1;
    } else if (intro) {
      this.say(intro);
    }
    this._warmCache(); // fire-and-forget: pre-synthesize the rest of the cues
  }

  // Stop location tracking (and the poll) without touching audio — lets a final
  // arrival cue finish speaking even as we wind the route down.
  async _haltLocation() {
    this._clearPoll();
    if (isWeb) {
      if (this._webWatch) { this._webWatch.remove(); this._webWatch = null; }
      return;
    }
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
        await Location.stopLocationUpdatesAsync(TASK);
      }
    } catch {}
  }

  async stop() {
    this.active = false;
    this._flushQueue();
    this._interrupt();
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    await this._haltLocation();
  }

  // The leg boundaries still ahead of us (pickup/dock/stop/dest), in order. The
  // reroute handler walks these from the current position to rebuild the path
  // while keeping the originally planned stations.
  remainingWaypoints() {
    return this.maneuvers.slice(this.idx).filter((m) => m.kind);
  }

  // Swap in a freshly fetched route for the remainder of the trip (after the rider
  // went off-route). Resumes guidance from the new first maneuver.
  replaceRoute(maneuvers, coords) {
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this.maneuvers = maneuvers || [];
    this.routeCoords = coords || [];
    this.idx = 0;
    this.preAnnounced = false;
    this._wpIdx = -1;
    this._wpMin = Infinity;
    this._offHits = 0;
    this._rerouting = false;
    const m0 = this.maneuvers[0];
    if (m0) {
      this.say(spokenManeuver(m0.instruction), { priority: 'high' });
      this.cb.onProgress && this.cb.onProgress({ maneuver: m0, next: this.maneuvers[1] || null, distance: Infinity, index: 0 });
      if (!m0.kind) this.idx = 1; // just announced it; don't re-announce on the next fix
    }
    this._warmCache();
  }

  // Reroute fetch failed or had nothing to do — drop the guard and keep guiding on
  // the existing route (better than going silent).
  cancelReroute() {
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this._rerouting = false;
    this._offHits = 0;
  }

  onLocation(loc) {
    if (!this.active) return;
    const here = { lat: loc.coords.latitude, lon: loc.coords.longitude };
    this.cb.onLocationUpdate && this.cb.onLocationUpdate(here, loc.coords.heading);

    // Stationary tracking (drives the "parked at the dock" arrival path).
    if (!this._lastPos || distanceMeters(here.lat, here.lon, this._lastPos.lat, this._lastPos.lon) > NAV.stationaryMoveM) {
      this._lastPos = here;
      this._lastMoveAt = Date.now();
    }

    // While a reroute fetch is in flight, keep the map following but don't speak or
    // advance on the stale route.
    if (this._rerouting) return;

    // Off-route -> reroute, but only if a handler is set (otherwise never bail,
    // so progression/arrival can't get stuck). Require a couple of consecutive
    // off-route fixes so a single GPS jump between buildings doesn't trigger it.
    if (this.cb.onReroute && this.routeCoords.length) {
      let min = Infinity;
      for (const [lat, lon] of this.routeCoords) {
        const d = distanceMeters(here.lat, here.lon, lat, lon);
        if (d < min) min = d;
      }
      this._offHits = min > NAV.offRouteM ? this._offHits + 1 : 0;
      if (this._offHits >= NAV.offRouteHits && Date.now() - this.lastReroute > NAV.rerouteCooldownMs) {
        this.lastReroute = Date.now();
        this._offHits = 0;
        this._rerouting = true;
        // Safety valve: if the rebuild hangs (no signal), resume the old route.
        this._rerouteTimer = setTimeout(() => {
          if (this._rerouting) { log('reroute timed out — resuming old route'); this._rerouting = false; }
        }, NAV.rerouteTimeoutMs);
        this.say('Recalculating.', { priority: 'high' });
        this.cb.onReroute(here);
        return;
      }
    }

    // Skip TURN maneuvers we've already passed (e.g. blew past a turn on a bike).
    // Never auto-skip a tagged waypoint — those must resolve via the geofence so
    // pickup/dock/destination cues can't be silently dropped.
    while (this.idx < this.maneuvers.length - 1) {
      const cm = this.maneuvers[this.idx];
      if (cm.kind) break;
      const nm = this.maneuvers[this.idx + 1];
      const dCur = distanceMeters(here.lat, here.lon, cm.location[0], cm.location[1]);
      const dNext = distanceMeters(here.lat, here.lon, nm.location[0], nm.location[1]);
      if (dCur > NAV.announceM && dNext < dCur) { this.idx += 1; this.preAnnounced = false; }
      else break;
    }

    const m = this.maneuvers[this.idx];
    if (!m) {
      // Backstop: no explicit dest waypoint — arrive near the final route point.
      const end = this.routeCoords[this.routeCoords.length - 1];
      if (end && distanceMeters(here.lat, here.lon, end[0], end[1]) < NAV.arriveM) {
        this.say('You have arrived.', { priority: 'high' });
        this.cb.onArrive && this.cb.onArrive();
        this.active = false;
        this._haltLocation(); // let the arrival cue finish; full stop comes on unmount
      }
      return;
    }

    // Reset the geofence trackers whenever the current waypoint changes.
    if (this._wpIdx !== this.idx) { this._wpIdx = this.idx; this._wpMin = Infinity; }

    const d = distanceMeters(here.lat, here.lon, m.location[0], m.location[1]);
    this.cb.onProgress && this.cb.onProgress({ maneuver: m, next: this.maneuvers[this.idx + 1] || null, distance: d, index: this.idx });

    // WAYPOINT (leg boundary): robust geofence arrival, not turn proximity.
    if (m.kind) {
      const reason = this._waypointArrived(here, m);
      if (reason) {
        log(`arrived ${m.kind} via ${reason} @ ${Math.round(d)}m`);
        this._clearPoll();
        this.say(m.instruction, { priority: 'high' });
        if (m.kind === 'dest') {
          log('route complete -> onArrive');
          this.cb.onArrive && this.cb.onArrive();
          this.active = false;
          this._haltLocation(); // keep tracking off but let the arrival cue play out
          return;
        }
        this.idx += 1;
        this.preAnnounced = false;
      } else if (d <= NAV.arriveZoneM) {
        this._armPoll(); // close to the waypoint — keep checking even if we stop
      }
      return;
    }

    // TURN: two cues — one advance ("In 300 feet, turn left onto X") and the
    // imminent call ("Turn left onto X") at the corner.
    if (d <= NAV.announceM) {
      this.say(spokenManeuver(m.instruction));
      this.idx += 1;
      this.preAnnounced = false;
    } else if (d <= NAV.preAnnounceM && !this.preAnnounced) {
      this.say(approachPhrase(d, m.instruction));
      this.preAnnounced = true;
    }
  }
}

export const nav = new NavController();

// Background location task — native only (no TaskManager in the browser).
if (!isWeb) {
  TaskManager.defineTask(TASK, ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data;
    const loc = locations && locations[locations.length - 1];
    if (loc) nav.onLocation(loc);
  });
}
