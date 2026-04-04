"use client";

import { useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { getToken } from '@/lib/auth';
import toast from 'react-hot-toast';

interface CustodyEvent {
  id: string;
  type: 'REGISTERED' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'CHECKED_OUT' | 'RETURNED' | 'MAINTAINED' | 'ALERT';
  timestamp: string;
  personResponsible: string;
  location?: { lat: number; lng: number };
}

const eventTypeColors: Record<string, string> = {
  REGISTERED: 'bg-purple-500',
  DISPATCHED: 'bg-blue-500',
  IN_TRANSIT: 'bg-warning',
  DELIVERED: 'bg-success',
  CHECKED_OUT: 'bg-teal-500',
  RETURNED: 'badge-ghost',
  MAINTAINED: 'bg-orange-500',
  ALERT: 'bg-error',
};

export default function CustodyPage() {
  const [assetId, setAssetId] = useState('');
  const [events, setEvents] = useState<CustodyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);

    try {
      const token = getToken();
      const response = await fetch(`/api/assets/${assetId}/events`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      toast.error('Failed to fetch custody chain');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
          Custody Chain
        </h1>
        <p className="text-base-content/60 mt-1">
          Track asset custody and movement history
        </p>
      </div>

      {/* Search */}
      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" />
                <input
                  type="text"
                  placeholder="Enter Asset ID (e.g., AST-001)"
                  className="input input-bordered w-full pl-12 military-input"
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary military-button" disabled={loading}>
              {loading ? <span className="loading loading-spinner"></span> : 'Search'}
            </button>
          </form>
        </div>
      </div>

      {/* Timeline */}
      {searched && (
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <h2 className="text-xl font-bold uppercase tracking-wider mb-6">
              Custody Timeline - {assetId}
            </h2>

            {events.length === 0 ? (
              <div className="text-center py-8 text-base-content/60">
                No custody events found for this asset
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-primary/30"></div>

                <div className="space-y-6">
                  {events.map((event, index) => (
                    <div key={event.id} className="relative flex gap-6">
                      {/* Timeline dot */}
                      <div className={`relative z-10 w-12 h-12 rounded-full ${eventTypeColors[event.type]} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-xs font-bold">{index + 1}</span>
                      </div>

                      {/* Event card */}
                      <div className="flex-1 card bg-base-200 p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`badge ${eventTypeColors[event.type]} text-white font-semibold uppercase`}>
                            {event.type.replace('_', ' ')}
                          </span>
                          <span className="text-sm text-base-content/60">
                            {new Date(event.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-semibold mb-1">{event.personResponsible}</p>
                        
                        {event.location && (
                          <div className="mt-2 p-2 bg-base-300 rounded flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-primary" />
                            <span className="text-sm">
                              Location: {event.location.lat.toFixed(4)}, {event.location.lng.toFixed(4)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
