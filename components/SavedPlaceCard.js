import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Icon from './Icon';
import { availabilityLevel, countFor, isUsable } from '../lib/gbfs';
import { effectiveMode, flippedMode, nearestDocks } from '../lib/savedPlaces';
import { useTheme, levelColor, radius, shadow } from '../lib/theme';

let Haptics = null;
try { Haptics = require('expo-haptics'); } catch {}
const tap = () => { if (Haptics && Platform.OS !== 'web') Haptics.selectionAsync(); };

const PLACE_ICON = { home: 'home', work: 'work', custom: 'pin' };

// Walking estimate: ~80 m/min, floored at 1 min.
const walkMin = (m) => Math.max(1, Math.round((m || 0) / 80));

// Unit label for the *primary* number, given the active mode + filter.
function primaryUnit(mode, bikeType) {
  if (mode === 'dock') return 'docks';
  if (bikeType === 'electric') return 'e-bikes';
  if (bikeType === 'classic') return 'manual';
  return 'bikes';
}

// A SavedPlace rendered with its 3 nearest docks, live. Tapping the badge flips
// the place between "bikes to take" and "docks to return" — see lib/savedPlaces.
export default function SavedPlaceCard({ place, stations, bikeType = 'both', onFlip, onRemove, onSelectDock }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const mode = effectiveMode(place);
  const docks = useMemo(() => nearestDocks(place, stations, 3), [place, stations]);
  const unit = primaryUnit(mode, bikeType);

  // Footer hint: nearest dock that can actually serve the current intent.
  const best = docks.find((d) => isUsable(d, mode) && countFor(d, mode, bikeType) > 0);
  const hint = mode === 'dock' ? 'nearest open dock' : 'nearest with a bike';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={onRemove ? () => { tap(); onRemove(place); } : undefined}
        style={styles.header}
      >
        <View style={styles.avatar}>
          <Icon name={PLACE_ICON[place.type] || 'pin'} size={18} color={c.primary} />
        </View>
        <View style={styles.headBody}>
          <Text style={styles.nickname} numberOfLines={1}>{place.nickname}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {docks.length ? `${docks.length} dock${docks.length > 1 ? 's' : ''} nearby` : 'No docks nearby'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.badge}
          activeOpacity={0.7}
          onPress={() => { tap(); onFlip && onFlip(place, flippedMode(place)); }}
          hitSlop={8}
        >
          <Icon name={mode === 'dock' ? 'dock' : 'bike'} size={13} color={c.text} />
          <Text style={styles.badgeTxt}>{mode === 'dock' ? 'docks' : 'bikes'}</Text>
          <Icon name="swap" size={12} color={c.textFaint} />
        </TouchableOpacity>
      </TouchableOpacity>

      {docks.map((d) => {
        const level = availabilityLevel(d, mode, bikeType);
        const lc = levelColor(c, level);
        const count = countFor(d, mode, bikeType);
        const secondary = mode === 'dock' ? `${d.bikes} bikes` : `${d.docks} docks`;
        const zero = count === 0;
        const primary = zero ? (mode === 'dock' ? 'Full' : 'Empty') : `${count} ${unit}`;
        return (
          <TouchableOpacity
            key={d.id}
            activeOpacity={0.7}
            onPress={() => onSelectDock && onSelectDock(d)}
            style={[styles.dockRow, zero && styles.dockRowBad]}
          >
            <View style={[styles.dot, { backgroundColor: lc.fg }]} />
            <View style={styles.dockBody}>
              <Text style={styles.dockName} numberOfLines={1}>{d.name}</Text>
              <View style={styles.dockMetaRow}>
                <Icon name="walk" size={11} color={c.textMute} />
                <Text style={styles.dockMeta}>{walkMin(d.distance)} min</Text>
              </View>
            </View>
            <View style={styles.counts}>
              <Text style={[styles.primary, { color: lc.fg }]}>{primary}</Text>
              <Text style={styles.secondary}>{secondary}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={styles.footer}>
        <Icon name="star" size={12} color={c.textFaint} />
        <Text style={styles.footerTxt} numberOfLines={1}>
          {best ? `${hint}: ` : 'none nearby right now'}
          {best ? <Text style={styles.footerStrong}>{best.name}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.elevated, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border,
      marginHorizontal: 16, marginBottom: 12, overflow: 'hidden', ...shadow(c).card,
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
    avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    headBody: { flex: 1 },
    nickname: { fontSize: 16, fontWeight: '700', color: c.text },
    subtitle: { fontSize: 12.5, color: c.textMute, marginTop: 2, fontWeight: '500' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    badgeTxt: { fontSize: 12, fontWeight: '600', color: c.text },

    dockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.hairline },
    dockRowBad: { backgroundColor: c.dangerBg },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dockBody: { flex: 1 },
    dockName: { fontSize: 14, fontWeight: '600', color: c.text },
    dockMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    dockMeta: { fontSize: 12, color: c.textMute, fontWeight: '400' },
    counts: { alignItems: 'flex-end' },
    primary: { fontSize: 15.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
    secondary: { fontSize: 12, color: c.textFaint, marginTop: 1, fontVariant: ['tabular-nums'] },

    footer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.hairline, backgroundColor: c.surface },
    footerTxt: { fontSize: 12, color: c.textMute, flex: 1 },
    footerStrong: { color: c.text, fontWeight: '600' },
  });
}
