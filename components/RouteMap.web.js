import React from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Shows the planned route polyline + markers (web/Leaflet).
export default function RouteMap({ coords, markers }) {
  if (!coords || !coords.length) return null;
  const lats = coords.map((c) => c[0]);
  const lons = coords.map((c) => c[1]);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  return (
    <div style={{ height: 220, borderRadius: 12, overflow: 'hidden' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={coords} pathOptions={{ color: '#1a73e8', weight: 4 }} />
        {markers.map((m, i) => (
          <CircleMarker
            key={i}
            center={[m.lat, m.lon]}
            radius={7}
            pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}
          >
            <Popup>{m.title}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
