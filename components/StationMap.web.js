import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { availabilityLevel, countFor } from '../lib/gbfs';
import { useTheme } from '../lib/theme';

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

function innerHtml(s, mode, bikeType) {
  if (mode === 'dock') return `${s.docks}`;
  if (bikeType === 'both') return `⚡${s.ebikes} <span style="opacity:.5">·</span> ${s.classic}`;
  if (bikeType === 'electric') return `⚡${s.ebikes}`;
  return `${s.classic}`;
}

function pillIcon(inner, color, ring, selected) {
  const scale = selected ? 1.25 : 1;
  return L.divIcon({
    className: '', iconSize: [40, 26], iconAnchor: [20, 13],
    html: `<div style="transform:scale(${scale});background:${color};color:#fff;border:2px solid ${ring};
      border-radius:13px;min-width:26px;height:26px;display:flex;align-items:center;justify-content:center;gap:2px;
      font:800 13px Inter,system-ui,sans-serif;padding:0 8px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.35)">${inner}</div>`,
  });
}

function dotIcon(color, ring) {
  return L.divIcon({
    className: '', iconSize: [14, 14], iconAnchor: [7, 7],
    html: `<div style="width:13px;height:13px;border-radius:7px;background:${color};border:1.5px solid ${ring};box-shadow:0 1px 2px rgba(0,0,0,.3)"></div>`,
  });
}

function Tracker({ onChange }) {
  const map = useMapEvents({ moveend: emit, zoomend: emit });
  function emit() {
    const b = map.getBounds();
    onChange(map.getZoom(), { minLat: b.getSouth(), maxLat: b.getNorth(), minLon: b.getWest(), maxLon: b.getEast() });
  }
  useEffect(emit, []); // eslint-disable-line
  return null;
}

export default function StationMap({ stations, center, mode, bikeType = 'both', selectedId, onSelect }) {
  const c = useTheme();
  const tile = c.scheme === 'dark' ? TILES.dark : TILES.light;
  const [view, setView] = useState(null); // { zoom, bounds }

  const markers = useMemo(() => {
    if (!view) return [];
    const { zoom, bounds } = view;
    const vis = stations.filter((s) => s.lat >= bounds.minLat && s.lat <= bounds.maxLat && s.lon >= bounds.minLon && s.lon <= bounds.maxLon);
    const usePill = zoom >= 14;
    return vis.map((s) => {
      const color = c[availabilityLevel(s, mode, bikeType)];
      const icon = usePill ? pillIcon(innerHtml(s, mode, bikeType), color, c.bg, selectedId === s.id) : dotIcon(color, c.bg);
      return { s, icon };
    });
  }, [stations, view, mode, bikeType, selectedId, c]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer key={c.scheme} center={[center.lat, center.lon]} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tile} attribution='&copy; OpenStreetMap &copy; CARTO' subdomains="abcd" />
        <Tracker onChange={(zoom, bounds) => setView({ zoom, bounds })} />
        {markers.map(({ s, icon }) => (
          <Marker key={s.id} position={[s.lat, s.lon]} icon={icon} eventHandlers={{ click: () => onSelect && onSelect(s) }} />
        ))}
      </MapContainer>
    </div>
  );
}
