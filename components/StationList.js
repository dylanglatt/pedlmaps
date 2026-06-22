import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { stationColor } from '../lib/gbfs';
import { formatDistance, formatAge } from '../lib/geo';

export default function StationList({ stations, mode, onSelect, saved, onToggleSave }) {
  const renderItem = ({ item: s }) => {
    const color = stationColor(s, mode);
    const isHome = saved?.homeId === s.id;
    const isWork = saved?.workId === s.id;
    return (
      <TouchableOpacity style={styles.row} onPress={() => onSelect && onSelect(s)}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {s.name}
            {isHome ? '  🏠' : ''}
            {isWork ? '  💼' : ''}
          </Text>
          <Text style={styles.meta}>
            {formatDistance(s.distance)} · {s.classic} reg · {s.ebikes} elec · {s.docks} docks
            {s.disabledBikes ? ` · ${s.disabledBikes} down` : ''} · {formatAge(s.lastReported)}
          </Text>
        </View>
        <View style={styles.bigWrap}>
          <Text style={[styles.big, { color }]}>{mode === 'dock' ? s.docks : s.bikes}</Text>
          <Text style={styles.bigLabel}>{mode === 'dock' ? 'docks' : 'bikes'}</Text>
        </View>
        {onToggleSave && (
          <View style={styles.saveCol}>
            <TouchableOpacity onPress={() => onToggleSave('home', s.id)} style={styles.saveBtn}>
              <Text style={[styles.saveTxt, isHome && styles.saveOn]}>🏠</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onToggleSave('work', s.id)} style={styles.saveBtn}>
              <Text style={[styles.saveTxt, isWork && styles.saveOn]}>💼</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={stations}
      keyExtractor={(s) => s.id}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  body: { flex: 1, paddingRight: 8 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  bigWrap: { alignItems: 'center', width: 52 },
  big: { fontSize: 20, fontWeight: '800' },
  bigLabel: { fontSize: 10, color: '#888' },
  saveCol: { marginLeft: 6 },
  saveBtn: { padding: 4 },
  saveTxt: { fontSize: 16, opacity: 0.25 },
  saveOn: { opacity: 1 },
  sep: { height: 1, backgroundColor: '#eee', marginLeft: 38 },
});
