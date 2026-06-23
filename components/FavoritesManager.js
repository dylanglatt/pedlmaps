import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform, Alert } from 'react-native';
import Icon from './Icon';
import { iconForPlace, tileColorKey } from '../lib/placeIcon';
import { findByType } from '../lib/savedPlaces';
import { useTheme, radius } from '../lib/theme';

function promptRename(current, cb) {
  if (Platform.OS === 'ios' && Alert.prompt) {
    Alert.prompt('Rename place', null, (t) => { const v = (t || '').trim(); if (v) cb(v); }, 'plain-text', current);
  }
}

// Apple-Maps-style favorites editor reached from the "Places ›" header.
export default function FavoritesManager({ visible, onClose, places = [], onAdd, onAddType, onRename, onDelete }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const TILE_BG = { home: c.accent2, work: c.primary, category: c.primary, pin: c.danger };

  const home = findByType(places, 'home');
  const work = findByType(places, 'work');
  const customs = places.filter((p) => p.type !== 'home' && p.type !== 'work');

  const FilledRow = ({ p }) => (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} activeOpacity={0.7} onPress={() => promptRename(p.nickname, (v) => onRename && onRename(p, v))}>
        <View style={[styles.icon, { backgroundColor: TILE_BG[tileColorKey(p)] }]}>
          <Icon name={iconForPlace(p)} size={18} color={c.onPrimary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>{p.nickname}</Text>
          {!!p.address && <Text style={styles.sub} numberOfLines={1}>{p.address}</Text>}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDelete && onDelete(p)} hitSlop={8} style={styles.trash}>
        <Icon name="clear" size={20} color={c.textFaint} />
      </TouchableOpacity>
    </View>
  );

  const EmptyRow = ({ type, label, icon }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onAddType && onAddType(type)}>
      <View style={[styles.icon, styles.iconEmpty]}>
        <Icon name={icon} size={18} color={c.textFaint} />
      </View>
      <Text style={[styles.name, styles.flex]}>{label}</Text>
      <Text style={styles.addTxt}>Add</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Favorites</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={styles.done}>Done</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {home ? <FilledRow p={home} /> : <EmptyRow type="home" label="Home" icon="home" />}
            {work ? <FilledRow p={work} /> : <EmptyRow type="work" label="Work" icon="work" />}
            {customs.map((p) => <FilledRow key={p.id} p={p} />)}
            <TouchableOpacity style={styles.addRow} activeOpacity={0.7} onPress={onAdd}>
              <View style={[styles.icon, styles.iconEmpty]}><Icon name="add" size={18} color={c.primary} /></View>
              <Text style={styles.addPlace}>Add a Place</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '82%', paddingTop: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    done: { fontSize: 16, fontWeight: '600', color: c.primary },

    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    iconEmpty: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    name: { fontSize: 15.5, fontWeight: '600', color: c.text },
    sub: { fontSize: 12.5, color: c.textMute, marginTop: 1 },
    addTxt: { fontSize: 14, color: c.primary, fontWeight: '600' },
    trash: { padding: 12 },

    addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, marginTop: 4, borderTopWidth: 1, borderTopColor: c.hairline },
    addPlace: { fontSize: 15.5, fontWeight: '600', color: c.primary },
  });
}
