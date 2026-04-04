"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet default icon issue
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

// Create custom red icon for alerts
const alertIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const defaultIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface GPSData {
  id: string;
  batchId: string;
  transporterName: string;
  assetsCount: number;
  lat: number;
  lng: number;
  lastUpdated: string;
  alert: boolean;
}

interface LeafletMapProps {
  gpsData: GPSData[];
  fullScreen?: boolean;
  interactive?: boolean;
}

export default function LeafletMapComponent({ gpsData, fullScreen = false, interactive = true }: LeafletMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Dynamically import Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  if (!mounted) {
    return <div className="w-full h-full bg-base-200 flex items-center justify-center">Loading map...</div>;
  }

  const heightClass = fullScreen ? 'h-screen' : 'h-[400px]';

  return (
    <MapContainer
      center={[28.6139, 77.209]}
      zoom={5}
      className={`w-full ${heightClass} z-0`}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {gpsData.map((item) => (
        <Marker
          key={item.id}
          position={[item.lat, item.lng]}
          icon={item.alert ? alertIcon : defaultIcon}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold mb-1">Batch: {item.batchId}</p>
              <p className="mb-1">Transporter: {item.transporterName}</p>
              <p className="mb-1">Assets: {item.assetsCount}</p>
              <p className="text-xs text-gray-500">
                Updated: {new Date(item.lastUpdated).toLocaleString()}
              </p>
              {item.alert && (
                <p className="text-red-600 font-bold mt-2">⚠️ ALERT ACTIVE</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
