import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function Follower({ follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow) map.setView([follow.lat, follow.lon], 16, { animate: true });
  }, [follow?.lat, follow?.lon]); // eslint-disable-line
  return null;
}

export default function RouteMap({ coords, markers, fill, follow }) {
  if (!coords || !coords.length) return null;
  const lats = coords.map((c) => c[0]);
  const lons = coords.map((c) => c[1]);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  const wrap = fill ? { position: 'absolute', inset: 0 } : { height: 220, borderRadius: 12, overflow: 'hidden' };
  return (
    <div style={wrap}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Polyline positions={coords} pathOptions={{ color: '#5B53E6', weight: 6 }} />
        {(markers || []).map((m, i) => (
          <CircleMarker key={i} center={[m.lat, m.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}>
            <Popup>{m.title}</Popup>
          </CircleMarker>
        ))}
        {follow && <Follower follow={follow} />}
      </MapContainer>
    </div>
  );
}
