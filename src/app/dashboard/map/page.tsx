"use client";

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import LeafletMapComponent from '@/components/map/LeafletMap';
import { getToken } from '@/lib/auth';

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

export default function MapPage() {
  const [gpsData, setGpsData] = useState<GPSData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState(0);

  const fetchGPSData = async () => {
    try {
      const token = getToken();
      const response = await fetch('/api/gps/active', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setGpsData(data.batches || []);
      setActiveCount(data.batches?.length || 0);
    } catch (error) {
      console.error('Failed to fetch GPS data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGPSData();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchGPSData, 10000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/70 uppercase tracking-wider">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
            Live GPS Tracking
          </h1>
          <p className="text-base-content/60 mt-1">
            Real-time asset location monitoring
          </p>
        </div>
      </div>

      {/* Active Batches Banner */}
      <div className="stats shadow-lg military-card w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-primary">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="stat-title uppercase tracking-wider">Active Batches In Transit</div>
          <div className="stat-value text-primary">{activeCount}</div>
          <div className="stat-desc">Updated live every 10 seconds</div>
        </div>
      </div>

      {/* Map */}
      <div className="card bg-base-100 shadow-xl military-card overflow-hidden">
        <LeafletMapComponent gpsData={gpsData} fullScreen={false} interactive={true} />
      </div>

      {/* Alert Markers Legend */}
      {gpsData.some(g => g.alert) && (
        <div className="alert alert-error shadow-lg">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <h3 className="font-bold uppercase">Active Alerts Detected</h3>
            <p className="text-sm">{gpsData.filter(g => g.alert).length} batch(es) with active alerts</p>
          </div>
        </div>
      )}
    </div>
  );
}
