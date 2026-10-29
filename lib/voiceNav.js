import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { distanceMeters } from './geo';
import { NAV, VOICE } from './config';
import { approachPhrase, spokenManeuver } from './navPhrasing';
import { matchToRoute, headingDelta } from './mapMatch';
import { isDecision } from './maneuvers';
import * as tts from './ttsGoogle';
import { fetchStations } from './gbfs';
import { createDockWatch, pollDock, recordSwitch } from './dockWatch';

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
  // Resolve, once per session, which voice we speak with AND which mode we run in:
  //   'enhanced' -> a downloaded Enhanced/Premium on-device voice is installed:
  //                 we speak fully on-device (offline, no network race). Best.
  //   'google'   -> no Enhanced voice installed but Google Neural2 is available:
  //                 use the network voice (pre-warmed + locked) so the rider still
  //                 gets a natural voice, and nudge them to install an Enhanced one.
  //   'compact'  -> nothing better available: the stock on-device compact voice.
  // The mode is LOCKED for the whole route — we never switch voices mid-ride.
  async _resolveVoice() {
    if (this._voiceResolved) return;
    this._voiceResolved = true;
    // Manual override: paste an installed voice id into VOICE.voiceId to force it.
    if (VOICE.voiceId) {
      this._voiceId = VOICE.voiceId;
      this._voiceMode = 'enhanced';
      this._voiceName = VOICE.voiceId;
      log('voice: override ->', this._voiceId);
      return;
    }
    try {
      const voices = (await Speech.getAvailableVoicesAsync()) || [];
      const lang = (VOICE.lang || 'en-US').toLowerCase();
      const Default = Speech.VoiceQuality?.Default ?? 'Default';
      const isEn = (v) => (v.language || '').toLowerCase().startsWith('en');
      const isLang = (v) => (v.language || '').toLowerCase() === lang;
      // "Better" = any non-default quality (covers both Enhanced and Premium).
      const better = (v) => v.quality && v.quality !== Default;
      const enhanced =
        voices.find((v) => isLang(v) && better(v)) ||
        voices.find((v) => isEn(v) && better(v)) ||
        null;
      const compact =
        voices.find((v) => isLang(v)) ||
        voices.find((v) => isEn(v)) ||
        null;
      const pick = enhanced || compact;
      this._voiceId = pick ? pick.identifier : null;
      this._voiceMode = enhanced ? 'enhanced' : 'compact';
      this._voiceName = pick ? pick.name : null;

      // Dev diagnostics: what's installed and which one we chose.
      const betterEn = voices.filter((v) => isEn(v) && better(v));
      log(`voices: ${voices.length} installed, ${betterEn.length} enhanced/premium en`);
      betterEn.forEach((v) => log(`  hi-q en: ${v.name} [${v.identifier}] q=${v.quality}`));
      log('voice picked:', pick ? `${pick.name} [${pick.identifier}] q=${pick.quality}` : 'system default (none installed)', '-> mode', this._voiceMode);
    } catch (e) {
      this._voiceId = null;
      this._voiceMode = 'compact';
      this._voiceName = null;
      log('voice resolve failed:', e && e.message);
    }
  }
  reset() {
    this.active = false;
    this._ready = false;           // guidance gate: stays false until start() has
                                   // spoken the opening + set idx, so an early GPS
                                   // fix during start()'s awaits can't announce a
                                   // turn before (or on top of) the opening cue
    this.maneuvers = [];
    this.routeCoords = [];
    this.idx = 0;
    this.preAnnounced = false;     // advance cue spoken for the current turn
    this.lastReroute = 0;
    this._offSince = 0;            // when we first went off-route (0 = on-route)
    this._matchSeg = 0;           // last map-matched segment (forward-bias hint)
    this._rerouting = false;       // a reroute fetch is in flight (pause guidance)
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this._lastSaid = null;         // de-dupe: text of the last spoken cue
    this._lastSaidAt = 0;          // de-dupe: when we last spoke
    this.cb = {};
    this._dock = createDockWatch(); // mid-ride dock reroute state (lib/dockWatch.js)
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

  async _playLine(text, token, attempt = 0) {
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
      log('tts synth failed:', e && e.message);
    }
    if (token !== this._active) return;
    // Locked to the Neural2 voice for the whole route — we NEVER switch to a
    // different (on-device) voice mid-trip. Planned cues are pre-warmed to disk at
    // GO while online, so the only thing that can miss here is a brand-new reroute
    // cue in a dead zone. Retry with backoff (signal usually returns); if it still
    // can't synthesize, skip THIS cue silently and move on — the turn banner still
    // shows it. Changing voices is never an option.
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      if (token === this._active) return this._playLine(text, token, attempt + 1);
      return;
    }
    log('tts gave up after retries; skipping cue, no voice switch:', text);
    this._onCueDone(token); // advance the queue without speaking
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

  async start({ maneuvers, routeCoords, intro, onProgress, onReroute, onDockSwitch, onArrive, onLocationUpdate }) {
    this.reset();
    this.maneuvers = maneuvers || [];
    this.routeCoords = routeCoords || [];
    this.cb = { onProgress, onReroute, onDockSwitch, onArrive, onLocationUpdate };
    this.active = true;

    await this._resolveVoice(); // pick the locked session voice + mode
    // Voice is the premium Google Neural2 voice by default (zero setup). If the
    // rider already has an Enhanced on-device voice installed, we silently use that
    // instead (equally premium, fully offline) — no prompt, no setup. EITHER WAY
    // the voice is LOCKED for the whole route here and NEVER changes mid-trip: the
    // Neural2 path below will retry/skip rather than drop to a different voice.
    const googleOk = !!(createAudioPlayer && tts.available());
    const useDevice = (VOICE.preferOnDevice !== false && this._voiceMode === 'enhanced') || !googleOk;
    this._primary = useDevice ? 'device' : 'google';
    this._ttsReady = this._primary === 'google'; // gates the cached-clip path
    log('voice locked:', this._primary, this._primary === 'device' ? (this._voiceName || 'on-device') : VOICE.googleVoice);

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
      // Pre-synthesize the opening before speaking it so GO is guaranteed the good
      // voice — never the cold-cache compact fallback that a first-cue network
      // round-trip used to cause. Best-effort; on failure say() falls back anyway.
      if (this._primary === 'google') { try { await tts.synthesize(opening); } catch {} }
      this.say(opening);
      this.cb.onProgress && this.cb.onProgress({ maneuver: this.maneuvers[0], next: this.maneuvers[1] || null, distance: Infinity, index: 0 });
      // We just spoke the departure cue; start tracking the first real turn so the
      // opening fix (standing right on maneuver 0) can't re-announce it.
      if (!this.maneuvers[0].kind) this.idx = 1;
    } else if (intro) {
      this.say(intro);
    }
    // Open the guidance gate only now — the opening has been spoken and idx is set,
    // so onLocation can safely take over for the rest of the route.
    this._ready = true;
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
  // went off-route, or a dock switch). Resumes guidance from the new first maneuver.
  // opts.lead: a line spoken first (the dock-switch announcement); the resume cue
  // then queues behind it at normal priority instead of cutting it off.
  replaceRoute(maneuvers, coords, opts = {}) {
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this.maneuvers = maneuvers || [];
    this.routeCoords = coords || [];
    this.idx = 0;
    this.preAnnounced = false;
    this._wpIdx = -1;
    this._wpMin = Infinity;
    this._offSince = 0;
    this._matchSeg = 0;
    this._rerouting = false;
    // Calm resume (Apple-style): only SPEAK if the first thing on the new route is
    // an actual decision — a turn or a waypoint cue. If it's just "head/continue on
    // <the street we're already on>", stay quiet, update the banner, and let the
    // next real turn announce itself at its corner. This is what stopped the route
    // re-saying "south on Broadway" every time a reroute fired on a long straight.
    if (opts.lead) this.say(opts.lead, { priority: 'high' });
    const prio = opts.lead ? 'normal' : 'high';
    const m0 = this.maneuvers[0];
    if (m0) {
      if (m0.kind) {
        this.say(m0.instruction, { priority: prio }); // waypoint cue (undock/dock/arrive)
      } else if (isDecision(m0)) {
        this.say(spokenManeuver(m0.instruction), { priority: prio });
        this.idx = 1; // announced; don't re-announce at the corner
      } else {
        this.idx = 1; // departure on the current street — resume silently
      }
      const cur = this.maneuvers[this.idx] || m0;
      this.cb.onProgress && this.cb.onProgress({ maneuver: cur, next: this.maneuvers[this.idx + 1] || null, distance: Infinity, index: this.idx });
    }
    this._warmCache();
  }

  // The rebuilt route for a dock switch is ready: record the switch (so we never
  // flip back) and resume on it, announcing the change.
  applyDockSwitch(maneuvers, coords, sw) {
    recordSwitch(this._dock, sw);
    this.replaceRoute(maneuvers, coords, { lead: sw.text });
  }

  // Mid-ride dock reroute: while the next leg boundary is a dock, poll its live
  // open-dock count. Throttled by timestamp inside pollDock (JS timers are
  // unreliable in the background) and fire-and-forget, so guidance never waits on
  // it and a failed fetch is just a skipped poll.
  _watchDock(here) {
    if (!this.cb.onDockSwitch) return;
    const wps = this.remainingWaypoints();
    const wp = wps[0] && wps[0].kind === 'dock' && wps[0].station ? wps[0] : null;
    const after = wps[1];
    const target = after ? { lat: after.location[0], lon: after.location[1] } : null;
    const routeAtPoll = this.maneuvers;
    pollDock(this._dock, { now: Date.now(), here, dock: wp && wp.station, target, lastRerouteAt: this.lastReroute, fetchStations })
      .then((d) => this._onDockDecision(d, here, wp, routeAtPoll))
      .catch((e) => log('dock watch error:', e && e.message));
  }

  _onDockDecision(d, here, wp, routeAtPoll) {
    if (!d || !this.active) return;
    if (d.action === 'none') {
      if (!['throttled', 'in-flight', 'not-riding'].includes(d.reason)) log(`dock watch: ${d.reason}${d.docks != null ? ` (${d.docks} docks)` : ''}`);
      return;
    }
    log(`dock watch: ${d.action} [${d.reason}] ${d.docks} docks${d.to ? ` -> ${d.to.name} (${d.to.docks} docks, +${d.extraSec}s)` : ''}`);
    // The heads-up is informational: queue it behind any turn cue rather than cut it
    // off. "Keeping your route" is a decision the rider should hear right away.
    if (d.action === 'warn') { this.say(d.text); return; }
    if (d.action !== 'switch') { this.say(d.text, { priority: 'high' }); return; }
    // Only switch on the route we polled against, and never race an off-route
    // reroute (shared _rerouting guard + cooldown). Dropped switches re-evaluate
    // on the next poll.
    if (this._rerouting || this.maneuvers !== routeAtPoll) { log('dock watch: route changed mid-fetch, switch dropped'); return; }
    this.lastReroute = Date.now();
    this._rerouting = true;
    this._rerouteTimer = setTimeout(() => {
      if (this._rerouting) { log('dock switch timed out — resuming old route'); this._rerouting = false; }
    }, NAV.rerouteTimeoutMs);
    const to = { id: d.to.id, name: d.to.name, lat: d.to.lat, lon: d.to.lon };
    const wps = this.remainingWaypoints().map((w) => (w === wp
      ? { ...w, location: [to.lat, to.lon], station: to, instruction: dockInstruction(w.instruction, to.name) }
      : w));
    this.cb.onDockSwitch(here, wps, d);
  }

  // Reroute fetch failed or had nothing to do — drop the guard and keep guiding on
  // the existing route (better than going silent).
  cancelReroute() {
    if (this._rerouteTimer) { clearTimeout(this._rerouteTimer); this._rerouteTimer = null; }
    this._rerouting = false;
    this._offSince = 0;
  }

  onLocation(loc) {
    if (!this.active) return;
    const here = { lat: loc.coords.latitude, lon: loc.coords.longitude };
    this.cb.onLocationUpdate && this.cb.onLocationUpdate(here, loc.coords.heading);
    // Keep the map following during start()'s async setup, but don't run any
    // guidance (turn cues / reroute) until the opening cue has been spoken.
    if (!this._ready) return;

    // Stationary tracking (drives the "parked at the dock" arrival path).
    if (!this._lastPos || distanceMeters(here.lat, here.lon, this._lastPos.lat, this._lastPos.lon) > NAV.stationaryMoveM) {
      this._lastPos = here;
      this._lastMoveAt = Date.now();
    }

    // While a reroute fetch is in flight, keep the map following but don't speak or
    // advance on the stale route.
    if (this._rerouting) return;

    this._watchDock(here);

    // Off-route -> reroute, Apple-style: map-match the fix to the route polyline
    // and reason about the LATERAL offset (how far off the line we are) plus our
    // HEADING vs the route's, held over TIME — not a raw nearest-point count. This
    // tolerates GPS noise and a parallel street ridden the right way, and reacts
    // faster when we're clearly going the wrong way. Only acts if a handler is set
    // (otherwise never bail, so progression/arrival can't get stuck).
    if (this.cb.onReroute && this.routeCoords.length > 1) {
      const match = matchToRoute(here, this.routeCoords, this._matchSeg);
      if (match) {
        this._matchSeg = match.segIdx; // forward-bias the next match
        const off = match.lateral > NAV.offRouteM;

        // Heading check: if we have a confident heading while actually moving,
        // compare it to the route's heading where we matched. A big mismatch =
        // "wrong way" (react fast); aligned = likely a parallel street (be patient
        // and require a wider gap before recalculating).
        let wrongWay = false;
        const hdg = loc.coords.heading;
        const spd = loc.coords.speed;
        if (hdg != null && hdg >= 0 && spd != null && spd > NAV.minMoveSpeed) {
          const dh = headingDelta(hdg, match.heading);
          wrongWay = dh != null && dh > NAV.headingOffDeg;
        }

        if (off) {
          if (!this._offSince) this._offSince = Date.now();
        } else {
          this._offSince = 0;
        }
        const heldMs = this._offSince ? Date.now() - this._offSince : 0;
        const needMs = wrongWay ? NAV.offRouteFastMs : NAV.offRouteSlowMs;
        const bigEnough = wrongWay ? true : match.lateral > NAV.offRouteHardM;

        if (this._offSince && heldMs >= needMs && bigEnough &&
            Date.now() - this.lastReroute > NAV.rerouteCooldownMs) {
          this.lastReroute = Date.now();
          this._offSince = 0;
          this._rerouting = true;
          // Safety valve: if the rebuild hangs (no signal), resume the old route.
          this._rerouteTimer = setTimeout(() => {
            if (this._rerouting) { log('reroute timed out — resuming old route'); this._rerouting = false; }
          }, NAV.rerouteTimeoutMs);
          log(`reroute: ${Math.round(match.lateral)}m off, ${wrongWay ? 'wrong-way' : 'held'} ${Math.round(heldMs)}ms`);
          this.say('Rerouting.', { priority: 'high' });
          this.cb.onReroute(here);
          return;
        }
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

    // TURN: up to two cues — a speed-scaled advance ("In 500 feet, turn left onto
    // X") and the imminent call ("Turn left onto X") at the corner.
    //
    // The advance distance is time-based (Apple-style): ~leadSec seconds of warning
    // at the current speed, clamped to [leadMinM, leadMaxM]. On a SHORT block — when
    // the previous turn was nearer than shortBlockM — we skip the advance and let
    // the corner cue stand alone, so two turns a block apart don't double up.
    if (d <= NAV.announceM) {
      this.say(spokenManeuver(m.instruction));
      this.idx += 1;
      this.preAnnounced = false;
    } else if (!this.preAnnounced) {
      const spd = (loc.coords.speed != null && loc.coords.speed > 0) ? loc.coords.speed : NAV.fallbackSpeedMps;
      const lead = Math.max(NAV.leadMinM, Math.min(NAV.leadMaxM, spd * NAV.leadSec));
      const prev = this.maneuvers[this.idx - 1];
      const gap = prev ? distanceMeters(prev.location[0], prev.location[1], m.location[0], m.location[1]) : Infinity;
      if (gap <= NAV.shortBlockM) {
        this.preAnnounced = true; // short block — corner cue alone, skip the advance
      } else if (d <= lead) {
        this.say(approachPhrase(d, m.instruction));
        this.preAnnounced = true;
      }
    }
  }
}

// "Dock your bike, then walk…" -> "Dock your bike at <name>, then walk…" (also
// re-targets an instruction that already names a station after an earlier switch).
function dockInstruction(instr, name) {
  const re = /^Dock your bike( at [^,]+)?/;
  return re.test(instr || '') ? instr.replace(re, `Dock your bike at ${name}`) : `Dock your bike at ${name}.`;
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
