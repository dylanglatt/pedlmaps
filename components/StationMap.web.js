import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { availabilityLevel } from '../lib/gbfs';
import { useTheme } from '../lib/theme';

// Premium muted basemaps (free, attribution required).
const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

function pillIcon(n, color, ring, selected) {
  const scale = selected ? 1.25 : 1;
  return L.divIcon({
    className: '',
    iconSize: [34, 26],
    iconAnchor: [17, 13],
    html: `<div style="transform:scale(${scale});background:${color};color:#fff;border:2px solid ${ring};
      border-radius:13px;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;
      font:800 13px Inter,system-ui,sans-serif;padding:0 7px;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
  });
}

export default function StationMap({ stations, center, mode, selectedId, onSelect }) {
  const c = useTheme();
  const tile = c.scheme === 'dark' ? TILES.dark : TILES.light;

  // Re-key the map on scheme so tiles swap cleanly.
  const markers = useMemo(
    () =>
      stations.map((s) => {
        const level = availabilityLevel(s, mode);
        const n = mode === 'dock' ? s.docks : s.bikes;
        return { s, icon: pillIcon(n, c[level], c.bg, selectedId === s.id) };
      }),
    [stations, mode, selectedId, c]
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer key={c.scheme} center={[center.lat, center.lon]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tile} attribution='&copy; OpenStreetMap &copy; CARTO' subdomains="abcd" />
        {markers.map(({ s, icon }) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lon]}
            icon={icon}
            eventHandlers={{ click: () => onSelect && onSelect(s) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
