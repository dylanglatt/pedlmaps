import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Platform, Keyboard, Alert,
} from 'react-native';
import Icon from './Icon';
import SavedPlacesRow from './SavedPlacesRow';
import FavoritesManager from './FavoritesManager';
import ReorderPair from './ReorderPair';
import { directions, WALK, BIKE } from '../lib/routing';
import { autocomplete, placeDetails } from '../lib/places';
import { planTrip, planMultiTrip, fmtMin, fmtMiles } from '../lib/tripPlanner';
import { getLocation } from '../lib/location';
import { loadRecents, addRecent, removeRecent, clearRecents } from '../lib/storage';
import { loadPlaces, addPlace, updatePlace, removePlace, makePlace, placeLabel } from '../lib/savedPlaces';
import { formatClock, distanceMeters, formatDistance } from '../lib/geo';
import RouteMap from './RouteMap';
import { useTheme, radius, font, shadow } from '../lib/theme';

// Name a place to save (iOS prompt; elsewhere defaults to the place name).
function promptNickname(defaultName, cb) {
  if (Platform.OS === 'ios' && Alert.prompt) {
    Alert.prompt('Name this place', null,
      (text) => cb((text || '').trim() || defaultName), 'plain-text', defaultName);
  } else {
    cb(defaultName);
  }
}

let Haptics = null;
try { Haptics = require('expo-haptics'); } catch {}
const buzz = (s) => { if (Haptics && Platform.OS !== 'web') Haptics.impactAsync(s || Haptics.ImpactFeedbackStyle.Light); };

const lonlat = (p) => [p.lon, p.lat];
const CURRENT = () => ({ name: 'My Location', current: true });

async function buildRoute(origin, oStation, dStation, dest) {
  const legs = await Promise.all([
    directions(WALK, [lonlat(origin), lonlat(oStation)]),
    directions(BIKE, [lonlat(oStation), lonlat(dStation)]),
    directions(WALK, [lonlat(dStation), lonlat(dest)]),
  ]);
  const maneuvers = [];
  const coords = [];
  legs.forEach((leg, i) => {
    if (i === 1) maneuvers.push({ instruction: 'Undock your bike and start riding.', location: leg.maneuvers[0]?.location || coords[coords.length - 1], distance: 0 });
    if (i === 2) maneuvers.push({ instruction: 'Dock your bike, then walk to your destination.', location: leg.maneuvers[0]?.location || coords[coords.length - 1], distance: 0 });
    maneuvers.push(...leg.maneuvers);
    coords.push(...leg.coords);
  });
  return { maneuvers, coords };
}

// Concatenate per-segment routes for a multi-stop trip, inserting a "stop" cue
// between segments. points = [origin, ...stops, dest]; segments aligns to gaps.
async function buildMultiRoute(points, segments) {
  const maneuvers = [];
  const coords = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const r = await buildRoute(points[i], seg.originStation, seg.destStation, points[i + 1]);
    if (i > 0) {
      maneuvers.push({ instruction: `Stop at ${points[i].name || 'your stop'}. Tap when ready to continue.`, location: r.coords[0] || coords[coords.length - 1], distance: 0 });
    }
    maneuvers.push(...r.maneuvers);
    coords.push(...r.coords);
  }
  return { maneuvers, coords };
}

export default function TripScreen({ stations, onStartNav }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [phase, setPhase] = useState('search');
  const [editing, setEditing] = useState('to'); // which endpoint the search sets
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState([]);
  const [recents, setRecents] = useState([]);
  const [places, setPlaces] = useState([]);
  const [saving, setSaving] = useState(false);   // "pick a place to save" mode
  const [saveType, setSaveType] = useState('custom'); // home | work | custom
  const [showManager, setShowManager] = useState(false);
  const [dragging, setDragging] = useState(false);    // disable result scroll while reordering stops
  const [origin, setOrigin] = useState(null);   // resolved {name,lat,lon,current?}
  const [dest, setDest] = useState(null);
  const [stop, setStop] = useState(null);        // single intermediate stop (cap 1)
  const [prefer, setPrefer] = useState('any');
  const [plan, setPlan] = useState(null);        // single-trip { best, alternates }
  const [multiPlan, setMultiPlan] = useState(null); // multi-stop { segments, totalSec, distanceM, points }
  const [selIdx, setSelIdx] = useState(0);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    loadRecents().then(setRecents);
    loadPlaces().then(setPlaces);
    getLocation().then((loc) => setOrigin({ ...CURRENT(), lat: loc.lat, lon: loc.lon })).catch(() => {});
  }, []);

  const onType = useCallback((t) => {
    setQuery(t);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => {
      try { setSugs(await autocomplete(t)); } catch { setSugs([]); }
    }, 300);
  }, []);

  const allPlans = plan ? [plan.best, ...plan.alternates] : [];
  const current = allPlans[selIdx] || null;

  const runPlan = useCallback(async (org, midsArr, d, pref) => {
    setBusy(true); setError(null); setPlan(null); setMultiPlan(null); setRoute(null); setSelIdx(0);
    const clean = (midsArr || []).filter(Boolean);
    try {
      if (clean.length === 0) {
        const result = await planTrip({ origin: org, dest: d, stations, prefer: pref });
        setPlan(result);
        try { setRoute(await buildRoute(org, result.best.originStation, result.best.destStation, d)); }
        catch { setRoute(null); }
      } else {
        const points = [org, ...clean, d];
        const mt = await planMultiTrip({ points, stations, prefer: pref });
        setMultiPlan({ ...mt, points });
        try { setRoute(await buildMultiRoute(points, mt.segments)); }
        catch { setRoute(null); }
      }
    } catch (e) { setError(e.message || 'Planning failed'); }
    finally { setBusy(false); }
  }, [stations]);

  const resolvePlace = async (place) => {
    if (place.current) { const loc = await getLocation(); return { ...CURRENT(), lat: loc.lat, lon: loc.lon }; }
    if (place.placeId) {
      const det = await placeDetails(place.placeId);
      return { name: place.primary || det.name, address: place.secondary || det.address, lat: det.lat, lon: det.lon };
    }
    if (place.nickname) { // a saved favorite — show "Place (Nickname)"
      return { name: placeLabel(place), address: place.address || '', lat: place.lat, lon: place.lon };
    }
    return { name: place.name || place.label, address: place.address || '', lat: place.lat, lon: place.lon };
  };

  const choose = useCallback(async (place) => {
    buzz(); Keyboard.dismiss();
    setBusy(true); setError(null);
    try {
      const resolved = await resolvePlace(place);
      if (saving) {
        const finish = async (nickname, type) => {
          await addPlace(makePlace({ nickname, type, lat: resolved.lat, lon: resolved.lon, address: resolved.address, name: resolved.name }));
          setPlaces(await loadPlaces());
        };
        if (saveType === 'home' || saveType === 'work') {
          finish(saveType === 'home' ? 'Home' : 'Work', saveType);
        } else {
          promptNickname(resolved.name, (nickname) => finish(nickname, 'custom'));
        }
        setSaving(false); setSaveType('custom'); setQuery(''); setSugs([]); setBusy(false);
        return;
      }
      let newOrigin = origin, newDest = dest, newStop = stop;
      if (editing === 'from') { newOrigin = resolved; setOrigin(resolved); }
      else if (editing === 'to') { newDest = resolved; setDest(resolved); if (!resolved.current) addRecent(resolved).then(setRecents); }
      else if (editing === 'stop') { newStop = resolved; setStop(resolved); }
      if (newOrigin && newDest) {
        setPhase('results');
        setQuery(''); setSugs([]);
        await runPlan(newOrigin, newStop ? [newStop] : [], newDest, prefer);
      } else {
        setEditing(newOrigin ? 'to' : 'from');
        setQuery(''); setSugs([]);
      }
    } catch (e) { setError(e.message || 'Could not plan trip'); }
    finally { setBusy(false); }
  }, [editing, origin, dest, stop, prefer, runPlan, saving, saveType]);

  const startSave = useCallback((type) => {
    setSaveType(type); setSaving(true); setShowManager(false); setQuery(''); setSugs([]);
  }, []);
  const onAddPlace = useCallback(() => startSave('custom'), [startSave]);

  const refreshPlaces = useCallback(async () => setPlaces(await loadPlaces()), []);
  const onRenamePlace = useCallback(async (p, name) => { await updatePlace(p.id, { nickname: name }); refreshPlaces(); }, [refreshPlaces]);
  const onDeletePlace = useCallback(async (p) => { await removePlace(p.id); refreshPlaces(); }, [refreshPlaces]);

  // Save a search suggestion straight to favorites (star on the result row).
  const saveSuggestion = async (s) => {
    buzz();
    try {
      const resolved = await resolvePlace(s);
      promptNickname(resolved.name, async (nickname) => {
        await addPlace(makePlace({ nickname, type: 'custom', lat: resolved.lat, lon: resolved.lon, address: resolved.address, name: resolved.name }));
        refreshPlaces();
      });
    } catch {}
  };

  const editField = useCallback((field) => {
    setEditing(field); setQuery(''); setSugs([]); setPhase('search');
  }, []);

  const changePrefer = useCallback((p) => {
    setPrefer(p);
    if (origin && dest) runPlan(origin, stop ? [stop] : [], dest, p);
  }, [origin, dest, stop, runPlan]);

  // Single stop (cap 1): open the search to add/edit it, or remove it.
  const openStop = useCallback(() => { setEditing('stop'); setQuery(''); setSugs([]); setPhase('search'); }, []);
  const removeStop = useCallback(() => {
    setStop(null);
    if (origin && dest) runPlan(origin, [], dest, prefer);
  }, [origin, dest, prefer, runPlan]);

  // Drag-to-swap: flip which of stop/destination you reach first.
  const swapStopDest = useCallback(() => {
    if (!stop || !dest) return;
    const newStop = dest, newDest = stop;
    setStop(newStop); setDest(newDest);
    if (origin) runPlan(origin, [newStop], newDest, prefer);
  }, [stop, dest, origin, prefer, runPlan]);

  const selectPlan = useCallback(async (idx) => {
    if (idx === selIdx) return;
    buzz();
    setSelIdx(idx);
    const p = allPlans[idx];
    if (!p || !origin || !dest) return;
    setBusy(true);
    try { setRoute(await buildRoute(origin, p.originStation, p.destStation, dest)); }
    catch { setRoute(null); }
    finally { setBusy(false); }
  }, [selIdx, allPlans, origin, dest]);

  const go = useCallback(async () => {
    buzz(Haptics?.ImpactFeedbackStyle?.Medium);
    if (multiPlan) {
      const segs = multiPlan.segments;
      const combined = {
        totalSec: multiPlan.totalSec, distanceM: multiPlan.distanceM,
        originStation: segs[0].originStation, destStation: segs[segs.length - 1].destStation,
        segments: segs, points: multiPlan.points,
      };
      let r = route;
      if (!r) {
        setBusy(true);
        try { r = await buildMultiRoute(multiPlan.points, segs); }
        catch (e) { setError(e.message || 'Could not start'); setBusy(false); return; }
        setBusy(false);
      }
      onStartNav && onStartNav({ plan: combined, route: r, dest });
      return;
    }
    if (!current || !origin || !dest) return;
    let r = route;
    if (!r) {
      setBusy(true);
      try { r = await buildRoute(origin, current.originStation, current.destStation, dest); }
      catch (e) { setError(e.message || 'Could not start'); setBusy(false); return; }
      setBusy(false);
    }
    onStartNav && onStartNav({ plan: current, route: r, dest });
  }, [multiPlan, current, origin, dest, route, onStartNav]);

  const onRemoveRecent = useCallback(async (r) => { setRecents(await removeRecent(r)); }, []);
  const onClearRecents = useCallback(async () => { setRecents(await clearRecents()); }, []);

  let markers = [];
  if (multiPlan) {
    multiPlan.segments.forEach((seg) => {
      markers.push({ lat: seg.originStation.lat, lon: seg.originStation.lon, title: `Pick up · ${seg.originStation.name}`, color: c.good, kind: 'pickup' });
      markers.push({ lat: seg.destStation.lat, lon: seg.destStation.lon, title: `Dock · ${seg.destStation.name}`, color: c.danger, kind: 'dock' });
    });
    multiPlan.points.slice(1, -1).forEach((pt, i) => markers.push({ lat: pt.lat, lon: pt.lon, title: pt.name || `Stop ${i + 1}`, color: c.accent2, kind: 'stop' }));
    if (dest) markers.push({ lat: dest.lat, lon: dest.lon, title: dest.name || 'Destination', color: c.primary, kind: 'dest' });
  } else if (current) {
    markers = [
      { lat: current.originStation.lat, lon: current.originStation.lon, title: `Pick up · ${current.originStation.name}`, color: c.good, kind: 'pickup' },
      { lat: current.destStation.lat, lon: current.destStation.lon, title: `Dock · ${current.destStation.name}`, color: c.danger, kind: 'dock' },
      ...(dest ? [{ lat: dest.lat, lon: dest.lon, title: dest.name || 'Destination', color: c.primary, kind: 'dest' }] : []),
    ];
  }

  // ---- SEARCH ----
  if (phase === 'search') {
    const showRecents = query.trim().length < 3;
    const originName = origin?.current ? 'My Location' : origin?.name;
    return (
      <View style={styles.flex}>
        {/* From / To editor */}
        <View style={styles.odCard}>
          <TouchableOpacity style={[styles.odRow, editing === 'from' && styles.odRowActive]} onPress={() => setEditing('from')} activeOpacity={0.7}>
            <Icon name="start" size={20} color={c.primary} />
            <Text style={styles.odTxt} numberOfLines={1}>{originName || 'Choose start'}</Text>
          </TouchableOpacity>
          {(stop || editing === 'stop') && (
            <>
              <View style={styles.odDivider} />
              <TouchableOpacity style={[styles.odRow, editing === 'stop' && styles.odRowActive]} onPress={() => setEditing('stop')} activeOpacity={0.7}>
                <Icon name="pin" size={18} color={c.accent2} />
                <Text style={styles.odTxt} numberOfLines={1}>{stop?.name || 'Choose stop'}</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.odDivider} />
          <TouchableOpacity style={[styles.odRow, editing === 'to' && styles.odRowActive]} onPress={() => setEditing('to')} activeOpacity={0.7}>
            <Icon name="pin" size={20} color={c.danger} />
            <Text style={styles.odTxt} numberOfLines={1}>{dest?.name || 'Choose destination'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={c.textMute} />
          <TextInput
            style={styles.searchInput}
            placeholder={saving ? 'Search a place to save' : editing === 'from' ? 'Choose start' : 'Search for a place'}
            placeholderTextColor={c.textFaint}
            value={query}
            onChangeText={onType}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSugs([]); }} hitSlop={8}>
              <Icon name="clear" size={18} color={c.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {error && <View style={styles.errRow}><Icon name="warning" size={14} color={c.danger} /><Text style={styles.err}>{error}</Text></View>}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {showRecents ? (
            <>
              {!saving && places.length > 0 && (
                <SavedPlacesRow
                  places={places}
                  from={origin && origin.lat != null ? origin : null}
                  onPick={choose}
                  onAdd={onAddPlace}
                  onAddType={startSave}
                  onManage={() => setShowManager(true)}
                />
              )}
              {editing === 'from' && (
                <Row icon="navigate" title="My Location" styles={styles} c={c} onPress={() => choose(CURRENT())} />
              )}
              {recents.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Recents</Text>
                  <TouchableOpacity onPress={onClearRecents} hitSlop={8}><Text style={styles.clear}>Clear</Text></TouchableOpacity>
                </View>
              )}
              {recents.map((r, i) => (
                <Row key={i} icon="time" title={r.name || r.label} sub={r.address} styles={styles} c={c}
                  dist={origin && origin.lat != null && r.lat != null ? formatDistance(distanceMeters(origin.lat, origin.lon, r.lat, r.lon), 'imperial') : null}
                  onPress={() => choose(r)} onRemove={() => onRemoveRecent(r)} />
              ))}
            </>
          ) : (
            sugs.map((s) => (
              <Row key={s.placeId} icon="pin" title={s.primary} sub={s.secondary} styles={styles} c={c} onPress={() => choose(s)} onSave={!saving ? () => saveSuggestion(s) : undefined} />
            ))
          )}
        </ScrollView>

        <FavoritesManager
          visible={showManager}
          onClose={() => setShowManager(false)}
          places={places}
          onAdd={onAddPlace}
          onAddType={startSave}
          onRename={onRenamePlace}
          onDelete={onDeletePlace}
        />
      </View>
    );
  }

  // ---- RESULTS ----
  const arrivalFor = (p) => formatClock(new Date(Date.now() + p.totalSec * 1000));
  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" scrollEnabled={!dragging}>
      {/* From / stops / To (tap to edit) */}
      <View style={styles.odCard}>
        <TouchableOpacity style={styles.odRow} onPress={() => editField('from')} activeOpacity={0.7}>
          <Icon name="start" size={20} color={c.primary} />
          <Text style={styles.odTxt} numberOfLines={1}>{origin?.current ? 'My Location' : origin?.name}</Text>
          <Icon name="forward" size={16} color={c.textFaint} />
        </TouchableOpacity>
        <View style={styles.odDivider} />
        {stop ? (
          <ReorderPair
            top={{ name: stop.name, icon: 'pin', color: c.accent2, onPress: openStop, onRemove: removeStop }}
            bottom={{ name: dest?.name, icon: 'pin', color: c.danger, onPress: () => editField('to') }}
            onSwap={swapStopDest}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}
            c={c}
            styles={styles}
          />
        ) : (
          <>
            <TouchableOpacity style={styles.odRow} onPress={() => editField('to')} activeOpacity={0.7}>
              <Icon name="pin" size={20} color={c.danger} />
              <Text style={styles.odTxt} numberOfLines={1}>{dest?.name}</Text>
              <Icon name="forward" size={16} color={c.textFaint} />
            </TouchableOpacity>
            <View style={styles.odDivider} />
            <TouchableOpacity style={styles.addStopRow} onPress={openStop} activeOpacity={0.7}>
              <Icon name="add" size={18} color={c.primary} />
              <Text style={styles.addStopTxt}>Add a stop</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.prefRow}>
        {[{ k: 'any', label: 'Any bike' }, { k: 'classic', label: 'Classic' }, { k: 'ebike', label: 'E-bike' }].map((o) => (
          <TouchableOpacity key={o.k} style={[styles.pref, prefer === o.k && styles.prefOn]} onPress={() => changePrefer(o.k)} activeOpacity={0.85}>
            <Text style={[styles.prefTxt, prefer === o.k && styles.prefTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {busy && <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />}
      {error && <View style={styles.errRow}><Icon name="warning" size={14} color={c.danger} /><Text style={styles.err}>{error}</Text></View>}

      {markers.length > 0 && <View style={{ marginTop: 14 }}><RouteMap markers={markers} markersOnly /></View>}

      {/* Multi-stop itinerary (chained segments) */}
      {multiPlan && (
        <View style={styles.bestCard}>
          <View style={styles.bestTop}>
            <View style={styles.flex}>
              <Text style={styles.bestMin}>{fmtMin(multiPlan.totalSec)}</Text>
              <Text style={styles.bestSub}>{arrivalFor(multiPlan)} arrival · {fmtMiles(multiPlan.distanceM || 0)} · {multiPlan.points.length - 2} stop{multiPlan.points.length - 2 > 1 ? 's' : ''}</Text>
            </View>
            <TouchableOpacity style={styles.goBtn} onPress={go} activeOpacity={0.9}>
              <Text style={styles.goTxt}>GO</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          {multiPlan.segments.map((seg, si) => {
            const bikeColor = seg.bikeType === 'ebike' ? c.ebike : c.classic;
            const bikeWord = seg.bikeType === 'ebike' ? 'e-bike' : 'classic';
            const toPoint = multiPlan.points[si + 1];
            const isLastSeg = si === multiPlan.segments.length - 1;
            return (
              <React.Fragment key={si}>
                <Step icon="walk" time={fmtMin(seg.walkToBikeSec)} title={`Walk to ${seg.originStation.name}`} styles={styles} c={c} />
                <Step icon="bike" time={fmtMin(seg.rideSec)} title="Ride" sub={bikeWord} subColor={bikeColor} styles={styles} c={c} />
                <Step icon="dock" title={`Dock at ${seg.destStation.name}`} sub={`${seg.destStation.docks} open docks`} styles={styles} c={c} />
                <Step icon={isLastSeg ? 'walk' : 'pin'} time={fmtMin(seg.walkToDestSec)} title={`Walk to ${toPoint?.name || (isLastSeg ? 'your destination' : 'your stop')}`} subColor={isLastSeg ? undefined : c.accent2} sub={isLastSeg ? undefined : 'stop'} last={isLastSeg} styles={styles} c={c} />
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* Single-trip routes in stable order — tap a collapsed one to expand it in place */}
      {allPlans.map((p, i) => {
        if (i !== selIdx) {
          return (
            <TouchableOpacity key={i} style={styles.altCard} onPress={() => selectPlan(i)} activeOpacity={0.7}>
              <Text style={styles.altMin}>{fmtMin(p.totalSec)}</Text>
              <Text style={styles.altTxt} numberOfLines={1}>via {p.originStation.name} → {p.destStation.name}</Text>
              <Icon name="forward" size={16} color={c.textFaint} />
            </TouchableOpacity>
          );
        }
        const bikeColor = p.bikeType === 'ebike' ? c.ebike : c.classic;
        const bikeWord = p.bikeType === 'ebike' ? 'e-bike' : 'classic';
        return (
          <View key={i} style={styles.bestCard}>
            <View style={styles.bestTop}>
              <View style={styles.flex}>
                <Text style={styles.bestMin}>{fmtMin(p.totalSec)}</Text>
                <Text style={styles.bestSub}>{arrivalFor(p)} arrival · {fmtMiles(p.distanceM || 0)}</Text>
                <Text style={[styles.bikeTag, { color: bikeColor }]}>{bikeWord}</Text>
              </View>
              <TouchableOpacity style={styles.goBtn} onPress={go} activeOpacity={0.9}>
                <Text style={styles.goTxt}>GO</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Step icon="walk" time={fmtMin(p.walkToBikeSec)} title={`Walk to ${p.originStation.name}`} sub={`${p.originStation.classic} classic · ${p.originStation.ebikes} e-bikes`} styles={styles} c={c} />
            <Step icon="bike" time={fmtMin(p.rideSec)} title="Ride" sub={bikeWord} subColor={bikeColor} styles={styles} c={c} />
            <Step icon="dock" title={`Dock at ${p.destStation.name}`} sub={`${p.destStation.docks} open docks`} styles={styles} c={c} />
            <Step icon="walk" time={fmtMin(p.walkToDestSec)} title={`Walk to ${dest?.name || 'your destination'}`} last styles={styles} c={c} />
          </View>
        );
      })}
    </ScrollView>
  );
}

function Row({ icon, title, sub, dist, onPress, onRemove, onSave, styles, c }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.rowLeft}>
          <View style={styles.rowIcon}><Icon name={icon} size={18} color={c.textMute} /></View>
          {!!dist && <Text style={styles.rowDist} numberOfLines={1}>{dist}</Text>}
        </View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
      {onSave && (
        <TouchableOpacity onPress={onSave} hitSlop={8} style={styles.rowRemove}>
          <Icon name="star" size={18} color={c.textFaint} />
        </TouchableOpacity>
      )}
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.rowRemove}>
          <Icon name="close" size={16} color={c.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Step({ icon, time, title, sub, subColor, last, styles, c }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <Icon name={icon} size={17} color={c.text} />
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepTop}>
          <Text style={styles.stepTitle} numberOfLines={1}>{title}</Text>
          {!!time && <Text style={styles.stepTime}>{time}</Text>}
        </View>
        {!!sub && <Text style={[styles.stepSub, subColor && { color: subColor, fontWeight: '600' }]}>{sub}</Text>}
      </View>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    odCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' },
    odRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
    odRowActive: { backgroundColor: c.surfaceAlt },
    odTxt: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
    odDivider: { height: 1, backgroundColor: c.hairline, marginLeft: 44 },
    addStopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
    addStopTxt: { fontSize: 14, color: c.primary, fontWeight: '600' },

    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 6, marginHorizontal: 16, marginBottom: 8 },
    searchInput: { flex: 1, fontSize: 16, color: c.text, fontWeight: '400' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    section: { fontSize: 12, fontWeight: '800', color: c.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
    clear: { fontSize: 13, fontWeight: '600', color: c.primary },

    row: { flexDirection: 'row', alignItems: 'center' },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 16 },
    rowRemove: { padding: 14 },
    rowLeft: { alignItems: 'center', gap: 2, minWidth: 34 },
    rowDist: { fontSize: 10.5, color: c.textMute, fontWeight: '500', fontVariant: ['tabular-nums'] },
    rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    rowSub: { fontSize: 12, color: c.textMute, fontWeight: '400', marginTop: 1 },

    prefRow: { flexDirection: 'row', gap: 6, marginTop: 4, marginHorizontal: 16, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    pref: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    prefOn: { backgroundColor: c.elevated, ...shadow(c).card },
    prefTxt: { fontSize: 13, fontWeight: '600', color: c.textMute },
    prefTxtOn: { color: c.text },
    errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginHorizontal: 16 },
    err: { color: c.danger, fontSize: 13, fontWeight: '600', flex: 1 },

    bestCard: { borderRadius: radius.lg, padding: 16, marginTop: 14, marginHorizontal: 16, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border, ...shadow(c).card },
    bestTop: { flexDirection: 'row', alignItems: 'center' },
    bestMin: { fontSize: 28, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    bestSub: { fontSize: 13, color: c.textMute, fontWeight: '500', marginTop: 2, fontVariant: ['tabular-nums'] },
    bestType: { fontSize: 12, color: c.textFaint, fontWeight: '400', marginTop: 1 },
    bikeTag: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
    goBtn: { backgroundColor: c.good, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadow(c).card },
    goTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
    divider: { height: 1, backgroundColor: c.hairline, marginVertical: 12 },

    altCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 14, marginTop: 10, marginHorizontal: 16, backgroundColor: c.surface },
    altMin: { fontSize: 17, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    altTxt: { flex: 1, fontSize: 13, color: c.textMute, fontWeight: '400' },

    step: { flexDirection: 'row' },
    stepRail: { width: 28, alignItems: 'center' },
    stepIcon: { fontSize: 16 },
    stepLine: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
    stepBody: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
    stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stepTitle: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1, paddingRight: 8 },
    stepTime: { fontSize: 13, fontWeight: '600', color: c.textMute, fontVariant: ['tabular-nums'] },
    stepSub: { fontSize: 12, color: c.textMute, marginTop: 1, fontWeight: '400' },
  });
}
