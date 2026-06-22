import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { stationColor, relevantCount } from '../lib/gbfs';

// Web map via Leaflet (react-native-maps does not run on web).
// CircleMarker avoids Leaflet's marker-icon asset issues with bundlers.
export default function StationMap({ stations, center, mode, ebikeOnly, onSelect }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {stations.map((s) => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={8}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillColor: stationColor(s, mode, ebikeOnly),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect && onSelect(s) }}
          >
            <Popup>
              <strong>{s.name}</strong>
              <br />
              {mode === 'dock'
                ? `${s.docks} docks`
                : `${ebikeOnly ? s.ebikes : s.bikes} ${ebikeOnly ? 'e-bikes' : 'bikes'}`}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
