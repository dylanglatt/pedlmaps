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

function Overviewer({ overview, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (overview) map.fitBounds(bounds, { padding: [40, 40] });
  }, [overview]); // eslint-disable-line
  return null;
}

export default function RouteMap({ coords, markers, fill, follow, overview, markersOnly }) {
  const hasCoords = coords && coords.length;
  const hasMarkers = markers && markers.length;
  if (!hasCoords && !(markersOnly && hasMarkers)) return null;
  const src = hasCoords ? coords : markers.map((m) => [m.lat, m.lon]);
  const lats = src.map((c) => c[0]);
  const lons = src.map((c) => c[1]);
  const bounds = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
  const wrap = fill ? { position: 'absolute', inset: 0 } : { height: 220, borderRadius: 12, overflow: 'hidden' };
  return (
    <div style={wrap}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {!markersOnly && hasCoords && <Polyline positions={coords} pathOptions={{ color: '#3B34B8', weight: 9, lineCap: 'round', lineJoin: 'round' }} />}
        {!markersOnly && hasCoords && <Polyline positions={coords} pathOptions={{ color: '#5B53E6', weight: 6, lineCap: 'round', lineJoin: 'round' }} />}
        {(markers || []).map((m, i) => (
          <CircleMarker key={i} center={[m.lat, m.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: m.color, fillOpacity: 1 }}>
            <Popup>{m.title}</Popup>
          </CircleMarker>
        ))}
        {follow && <Follower follow={follow} />}
        <Overviewer overview={overview} bounds={bounds} />
      </MapContainer>
    </div>
  );
}
