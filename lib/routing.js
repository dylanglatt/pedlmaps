// Routing facade — delegates to Google or ORS based on PROVIDER in config.js.
// Both providers expose the same interface; callers use the generic profiles below.
import { PROVIDER } from './config';
import * as google from './routingGoogle';
import * as ors from './routingOrs';

const impl = PROVIDER === 'ors' ? ors : google;

// Generic profiles (each provider maps these to its own names).
export const WALK = 'walk';
export const BIKE = 'bike';

export const geocode = (text) => impl.geocode(text);
export const matrix = (profile, locations, sources, destinations) =>
  impl.matrix(profile, locations, sources, destinations);
export const directions = (profile, coordinates) => impl.directions(profile, coordinates);
