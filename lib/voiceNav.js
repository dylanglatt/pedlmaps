import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { distanceMeters } from './geo';
import { NAV, VOICE } from './config';

let setAudioModeAsync = null;
try { ({ setAudioModeAsync } = require('expo-audio')); } catch {}

const TASK = 'CITIBIKE_NAV_TASK';
const isWeb = Platform.OS === 'web';
const metersToFeet = (m) => Math.round((m * 3.281) / 10) * 10;

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
    if (v) Speech.stop();
  }

  // Pick the best installed voice once per session: prefer an Enhanced/premium
  // en-US voice (Siri-quality, on-device) and fall back to the system default.
  // iOS only ships compact voices until the user downloads the better ones
  // (Settings → Accessibility → Spoken Content → Voices), so this is best-effort.
  async _resolveVoice() {
    if (this._voiceResolved) return;
    this._voiceResolved = true;
    try {
      const voices = (await Speech.getAvailableVoicesAsync()) || [];
      const lang = (VOICE.lang || 'en-US').toLowerCase();
      const isEn = (v) => (v.language || '').toLowerCase().startsWith('en');
      const isLang = (v) => (v.language || '').toLowerCase() === lang;
      const enhanced = (v) => v.quality === (Speech.VoiceQuality?.Enhanced ?? 'Enhanced');
      const pick =
        voices.find((v) => isLang(v) && enhanced(v)) ||
        voices.find((v) => isEn(v) && enhanced(v)) ||
        voices.find((v) => isLang(v)) ||
        voices.find((v) => isEn(v));
      this._voiceId = pick ? pick.identifier : null;
      log('voice:', this._voiceId || 'system default');
    } catch {
      this._voiceId = null;
    }
  }
  reset() {
    this.active = false;
    this.maneuvers = [];
    this.routeCoords = [];
    this.idx = 0;
    this.preAnnounced = false;
    this.lastReroute = 0;
    this.cb = {};
    // Waypoint-geofence state (leg boundaries: pickup/dock/stop/dest).
    this._wpIdx = -1;        // which maneuver index the geofence trackers belong to
    this._wpMin = Infinity;  // closest we've come to the current waypoint
    this._lastPos = null;    // last position used for stationary detection
    this._lastMoveAt = 0;    // timestamp we last meaningfully moved
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

  say(text) {
    log('say:', text);
    if (this.muted) return;
    Speech.stop();
    Speech.speak(text, {
      rate: VOICE.rate,
      pitch: VOICE.pitch,
      ...(this._voiceId ? { voice: this._voiceId } : {}),
    });
  }

  async start({ maneuvers, routeCoords, intro, onProgress, onReroute, onArrive, onLocationUpdate }) {
    this.reset();
    this.maneuvers = maneuvers || [];
    this.routeCoords = routeCoords || [];
    this.cb = { onProgress, onReroute, onArrive, onLocationUpdate };
    this.active = true;

    await this._resolveVoice(); // choose the best voice before the first cue

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
          notificationTitle: 'Citi Bike navigation',
          notificationBody: 'Guiding you to your dock',
        },
      });
    }
    if (this.maneuvers[0]) {
      const opening = `${intro ? intro + ' ' : ''}${this.maneuvers[0].instruction}`.trim();
      this.say(opening);
      this.cb.onProgress && this.cb.onProgress({ maneuver: this.maneuvers[0], next: this.maneuvers[1] || null, distance: Infinity, index: 0 });
    } else if (intro) {
      this.say(intro);
    }
  }

  async stop() {
    this.active = false;
    this._clearPoll();
    Speech.stop();
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

  onLocation(loc) {
    if (!this.active) return;
    const here = { lat: loc.coords.latitude, lon: loc.coords.longitude };
    this.cb.onLocationUpdate && this.cb.onLocationUpdate(here, loc.coords.heading);

    // Stationary tracking (drives the "parked at the dock" arrival path).
    if (!this._lastPos || distanceMeters(here.lat, here.lon, this._lastPos.lat, this._lastPos.lon) > NAV.stationaryMoveM) {
      this._lastPos = here;
      this._lastMoveAt = Date.now();
    }

    // Off-route -> reroute, but only if a handler is set (otherwise never bail,
    // so progression/arrival can't get stuck).
    if (this.cb.onReroute && this.routeCoords.length) {
      let min = Infinity;
      for (const [lat, lon] of this.routeCoords) {
        const d = distanceMeters(here.lat, here.lon, lat, lon);
        if (d < min) min = d;
      }
      if (min > NAV.offRouteM && Date.now() - this.lastReroute > 12000) {
        this.lastReroute = Date.now();
        this.say('Off route. Recalculating.');
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
        this.say('You have arrived.');
        this.cb.onArrive && this.cb.onArrive();
        this.stop();
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
        this.say(m.instruction);
        if (m.kind === 'dest') {
          log('route complete -> onArrive + stop');
          this.cb.onArrive && this.cb.onArrive();
          this.stop();
          return;
        }
        this.idx += 1;
        this.preAnnounced = false;
      } else if (d <= NAV.arriveZoneM) {
        this._armPoll(); // close to the waypoint — keep checking even if we stop
      }
      return;
    }

    // TURN: lightweight pre-announce / announce.
    if (d <= NAV.announceM) {
      this.say(m.instruction);
      this.idx += 1;
      this.preAnnounced = false;
    } else if (d <= NAV.preAnnounceM && !this.preAnnounced) {
      this.say(`In ${metersToFeet(d)} feet, ${m.instruction}`);
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
