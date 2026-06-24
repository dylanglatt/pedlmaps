import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
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

// Two-tier markers (mirrors RouteMap.native): places read big + dark, bike
// stations are smaller chips. ink/paper theme the line + ring for light/dark.
function markerHtml(m, paper) {
  const ring = `border:2px solid ${paper};box-shadow:0 1px 3px rgba(0,0,0,.35);box-sizing:border-box;display:flex;align-items:center;justify-content:center;`;
  if (m.kind === 'origin')
    return `<div style="width:16px;height:16px;border-radius:50%;background:${m.color};border:3px solid ${paper};box-shadow:0 1px 3px rgba(0,0,0,.35);box-sizing:border-box;"></div>`;
  if (m.kind === 'stop')
    return `<div style="min-width:24px;height:24px;padding:0 4px;border-radius:7px;background:${m.color};color:${paper};font:800 13px/1 sans-serif;${ring}">${m.num ?? ''}</div>`;
  if (m.kind === 'dest')
    return `<svg width="22" height="29" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg"><path d="M12 1C6.477 1 2 5.477 2 11c0 6 10 20 10 20s10-14 10-20C22 5.477 17.523 1 12 1z" fill="${m.color}" stroke="${paper}" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="11" r="3.6" fill="${paper}"/></svg>`;
  if (m.kind === 'pickup')
    return `<div style="width:20px;height:20px;border-radius:50%;background:${m.color};color:#fff;font:700 12px/1 sans-serif;${ring}">🚲</div>`;
  if (m.kind === 'dock')
    return `<div style="width:20px;height:20px;border-radius:50%;background:${m.color};color:#fff;font:800 12px/1 sans-serif;${ring}">P</div>`;
  return `<div style="width:14px;height:14px;border-radius:50%;background:${m.color};border:2px solid ${paper};box-shadow:0 1px 3px rgba(0,0,0,.35);box-sizing:border-box;"></div>`;
}

export default function RouteMap({
  coords, markers, fill, follow, overview, markersOnly, ink = '#111', paper = '#fff',
}) {
  const hasCoords = coords && coords.length;
  const hasMarkers = markers && markers.length;
  if (!hasCoords && !hasMarkers) return null;
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
        {!markersOnly && hasCoords && <Polyline positions={coords} pathOptions={{ color: paper, weight: 9, lineCap: 'round', lineJoin: 'round' }} />}
        {!markersOnly && hasCoords && <Polyline positions={coords} pathOptions={{ color: ink, weight: 5.5, lineCap: 'round', lineJoin: 'round' }} />}
        {(markers || []).map((m, i) => (
          <Marker
            key={i}
            position={[m.lat, m.lon]}
            icon={L.divIcon({
              html: markerHtml(m, paper),
              className: '',
              // the dest pin is taller and anchors at its tip; others stay centered
              iconSize: m.kind === 'dest' ? [22, 29] : [26, 26],
              iconAnchor: m.kind === 'dest' ? [11, 28] : [13, 13],
            })}
          >
            <Popup>{m.title}</Popup>
          </Marker>
        ))}
        {follow && <Follower follow={follow} />}
        <Overviewer overview={overview} bounds={bounds} />
      </MapContainer>
    </div>
  );
}
