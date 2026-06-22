import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { distanceMeters } from './geo';
import { NAV } from './config';

const TASK = 'CITIBIKE_NAV_TASK';
const isWeb = Platform.OS === 'web';
const metersToFeet = (m) => Math.round((m * 3.281) / 10) * 10;

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
  reset() {
    this.active = false;
    this.maneuvers = [];
    this.routeCoords = [];
    this.idx = 0;
    this.preAnnounced = false;
    this.lastReroute = 0;
    this.cb = {};
  }

  say(text) {
    if (this.muted) return;
    Speech.stop();
    Speech.speak(text, { rate: 1.0 });
  }

  async start({ maneuvers, routeCoords, onProgress, onReroute, onArrive }) {
    this.reset();
    this.maneuvers = maneuvers || [];
    this.routeCoords = routeCoords || [];
    this.cb = { onProgress, onReroute, onArrive };
    this.active = true;

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
      this.say(this.maneuvers[0].instruction);
      this.cb.onProgress && this.cb.onProgress({ maneuver: this.maneuvers[0], next: this.maneuvers[1] || null, distance: Infinity, index: 0 });
    }
  }

  async stop() {
    this.active = false;
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

    // Off-route check (sampled distance to the route polyline).
    if (this.routeCoords.length) {
      let min = Infinity;
      for (const [lat, lon] of this.routeCoords) {
        const d = distanceMeters(here.lat, here.lon, lat, lon);
        if (d < min) min = d;
      }
      if (min > NAV.offRouteM && Date.now() - this.lastReroute > 12000) {
        this.lastReroute = Date.now();
        this.say('Off route. Recalculating.');
        this.cb.onReroute && this.cb.onReroute(here);
        return;
      }
    }

    const m = this.maneuvers[this.idx];
    if (!m) {
      // Past the last maneuver — check arrival at final point.
      const end = this.routeCoords[this.routeCoords.length - 1];
      if (end && distanceMeters(here.lat, here.lon, end[0], end[1]) < NAV.arriveM) {
        this.say('You have arrived.');
        this.cb.onArrive && this.cb.onArrive();
        this.stop();
      }
      return;
    }

    const d = distanceMeters(here.lat, here.lon, m.location[0], m.location[1]);
    this.cb.onProgress && this.cb.onProgress({ maneuver: m, next: this.maneuvers[this.idx + 1] || null, distance: d, index: this.idx });

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
