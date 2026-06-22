import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { availabilityLevel, relevantCount } from '../lib/gbfs';
import { useTheme } from '../lib/theme';

// Native map (iOS/Android) with custom pill markers.
export default function StationMap({ stations, center, mode, selectedId, onSelect }) {
  const c = useTheme();
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      userInterfaceStyle={c.scheme}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      {stations.map((s) => {
        const level = availabilityLevel(s, mode);
        const n = mode === 'dock' ? s.docks : s.bikes;
        const color = c[level];
        const selected = selectedId === s.id;
        return (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lon }}
            onPress={() => onSelect && onSelect(s)}
            zIndex={selected ? 99 : 1}
          >
            <View style={[styles.pill, { backgroundColor: color, borderColor: c.bg }, selected && styles.pillSel]}>
              <Text style={[styles.pillTxt, { color: '#fff' }]}>{n}</Text>
            </View>
            <Callout tooltip>
              <View style={[styles.callout, { backgroundColor: c.elevated, borderColor: c.border }]}>
                <Text style={[styles.cName, { color: c.text }]}>{s.name}</Text>
                <Text style={[styles.cMeta, { color: c.textMute }]}>
                  {mode === 'dock' ? `${s.docks} open docks` : `${s.classic} regular · ${s.ebikes} electric`}
                </Text>
              </View>
            </Callout>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  pillSel: { transform: [{ scale: 1.25 }] },
  pillTxt: { fontSize: 13, fontWeight: '800' },
  callout: { padding: 10, borderRadius: 12, borderWidth: 1, minWidth: 150 },
  cName: { fontSize: 14, fontWeight: '700' },
  cMeta: { fontSize: 12, marginTop: 2 },
});
