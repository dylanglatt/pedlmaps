import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Icon from './Icon';
import { iconForPlace, tileColorKey } from '../lib/placeIcon';
import { findByType } from '../lib/savedPlaces';
import { distanceMeters, formatDistance } from '../lib/geo';
import { useTheme, radius } from '../lib/theme';

// Apple-Maps-style row: Home + Work pinned slots (with Add when empty), then
// custom favorites, then an Add tile. The "Places ›" header opens the manager.
export default function SavedPlacesRow({ places = [], from, units = 'imperial', onPick, onAdd, onAddType, onManage, onRemove }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const TILE_BG = { home: c.accent2, work: c.primary, category: c.primary, pin: c.danger };

  const home = findByType(places, 'home');
  const work = findByType(places, 'work');
  const customs = places.filter((p) => p.type !== 'home' && p.type !== 'work');

  const subtitle = (p) => {
    if (from && from.lat != null && p.lat != null) {
      const m = distanceMeters(from.lat, from.lon, p.lat, p.lon);
      return m < 300 ? 'Close by' : formatDistance(m, units);
    }
    return p.address || '';
  };

  const FilledTile = ({ p }) => (
    <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={() => onPick && onPick(p)} onLongPress={() => onRemove && onRemove(p)} delayLongPress={350}>
      <View style={[styles.circle, { backgroundColor: TILE_BG[tileColorKey(p)] }]}>
        <Icon name={iconForPlace(p)} size={26} color={c.onPrimary} />
      </View>
      <Text style={styles.name} numberOfLines={2}>{p.nickname}</Text>
      <Text style={styles.sub} numberOfLines={1}>{subtitle(p)}</Text>
    </TouchableOpacity>
  );

  const EmptySlot = ({ type, label, icon }) => (
    <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={() => onAddType && onAddType(type)}>
      <View style={[styles.circle, styles.emptyCircle]}>
        <Icon name={icon} size={24} color={c.textFaint} />
      </View>
      <Text style={styles.name} numberOfLines={2}>{label}</Text>
      <Text style={styles.subAdd} numberOfLines={1}>Add</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.header} activeOpacity={0.7} onPress={onManage} hitSlop={6}>
        <Text style={styles.section}>Places</Text>
        <Icon name="forward" size={15} color={c.textMute} />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {home ? <FilledTile p={home} /> : <EmptySlot type="home" label="Home" icon="home" />}
        {work ? <FilledTile p={work} /> : <EmptySlot type="work" label="Work" icon="work" />}
        {customs.map((p) => <FilledTile key={p.id} p={p} />)}
        {onAdd && (
          <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={onAdd}>
            <View style={[styles.circle, styles.emptyCircle]}>
              <Icon name="add" size={26} color={c.textMute} />
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    wrap: { marginBottom: 6 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 16, marginBottom: 10 },
    section: { fontSize: 12, fontWeight: '800', color: c.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
    row: { paddingHorizontal: 16, gap: 16 },
    tile: { width: 70, alignItems: 'center' },
    circle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
    emptyCircle: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    name: { fontSize: 12.5, fontWeight: '600', color: c.text, marginTop: 7, maxWidth: 70, textAlign: 'center' },
    sub: { fontSize: 11, color: c.textMute, marginTop: 1, maxWidth: 70, textAlign: 'center' },
    subAdd: { fontSize: 11, color: c.primary, fontWeight: '600', marginTop: 1, textAlign: 'center' },
  });
}
