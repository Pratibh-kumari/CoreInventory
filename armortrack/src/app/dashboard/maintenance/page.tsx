"use client";

import { useState, useEffect } from 'react';
import { Wrench, CheckCircle, AlertTriangle } from 'lucide-react';
import { getToken } from '@/lib/auth';
import toast from 'react-hot-toast';

interface MaintenanceAsset {
  id: string;
  name: string;
  lastServiced: string;
  daysUntilDue: number;
}

export default function MaintenancePage() {
  const [dueAssets, setDueAssets] = useState<MaintenanceAsset[]>([]);
  const [allAssets, setAllAssets] = useState<MaintenanceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<'daysUntilDue' | 'nextService'>('daysUntilDue');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = getToken();
      
      const [dueRes, allRes] = await Promise.all([
        fetch('/api/maintenance/due', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/maintenance/all', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      const dueData = await dueRes.json();
      const allData = await allRes.json();

      setDueAssets(dueData.assets || []);
      setAllAssets(allData.assets || []);
    } catch (error) {
      console.error('Failed to fetch maintenance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (assetId: string) => {
    try {
      const token = getToken();
      const response = await fetch('/api/maintenance/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ asset_id: assetId }),
      });

      if (response.ok) {
        toast.success('Maintenance marked complete');
        setDueAssets(prev => prev.filter(a => a.id !== assetId));
      }
    } catch (error: any) {
      toast.error('Failed to update maintenance');
    }
  };

  const getDaysColor = (days: number) => {
    if (days < 7) return 'text-error';
    if (days < 30) return 'text-warning';
    return 'text-base-content';
  };

  const sortedAssets = [...allAssets].sort((a, b) => {
    const modifier = sortAsc ? 1 : -1;
    return (a[sortField] - b[sortField]) * modifier;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/70 uppercase tracking-wider">Loading maintenance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
          Maintenance Management
        </h1>
        <p className="text-base-content/60 mt-1">
          Track and schedule asset maintenance
        </p>
      </div>

      {/* Summary Card */}
      <div className="stats shadow-lg military-card w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-warning">
            <Wrench className="w-8 h-8" />
          </div>
          <div className="stat-title uppercase tracking-wider">Assets Due This Week</div>
          <div className="stat-value text-warning">{dueAssets.filter(a => a.daysUntilDue < 7).length}</div>
          <div className="stat-desc">Requires immediate attention</div>
        </div>
      </div>

      {/* Assets Due */}
      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body">
          <h2 className="text-xl font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Maintenance Due
          </h2>
          
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="bg-base-200">
                  <th className="uppercase tracking-wider text-sm">Asset ID</th>
                  <th className="uppercase tracking-wider text-sm">Name</th>
                  <th className="uppercase tracking-wider text-sm">Last Serviced</th>
                  <th className="uppercase tracking-wider text-sm">Days Until Due</th>
                  <th className="uppercase tracking-wider text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dueAssets.map((asset) => (
                  <tr key={asset.id} className="transition-all duration-300">
                    <td className="font-mono font-bold text-primary">{asset.id}</td>
                    <td>{asset.name}</td>
                    <td className="text-base-content/70">{new Date(asset.lastServiced).toLocaleDateString()}</td>
                    <td className={`font-bold ${getDaysColor(asset.daysUntilDue)}`}>
                      {asset.daysUntilDue} days
                    </td>
                    <td>
                      <button
                        onClick={() => handleMarkComplete(asset.id)}
                        className="btn btn-sm btn-success military-button"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Mark Complete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* All Assets Schedule */}
      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body">
          <h2 className="text-xl font-bold uppercase tracking-wider mb-4">All Assets - Service Schedule</h2>
          
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="bg-base-200">
                  <th className="uppercase tracking-wider text-sm cursor-pointer" onClick={() => { setSortField('id'); setSortAsc(!sortAsc); }}>
                    Asset ID {sortField === 'id' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="uppercase tracking-wider text-sm">Name</th>
                  <th className="uppercase tracking-wider text-sm cursor-pointer" onClick={() => { setSortField('daysUntilDue'); setSortAsc(!sortAsc); }}>
                    Next Service (Days) {sortField === 'daysUntilDue' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="uppercase tracking-wider text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td className="font-mono font-bold text-primary">{asset.id}</td>
                    <td>{asset.name}</td>
                    <td className={`font-bold ${getDaysColor(asset.daysUntilDue)}`}>
                      {asset.daysUntilDue} days
                    </td>
                    <td>
                      {asset.daysUntilDue < 0 ? (
                        <span className="badge badge-error badge-sm uppercase">Overdue</span>
                      ) : asset.daysUntilDue < 30 ? (
                        <span className="badge badge-warning badge-sm uppercase">Due Soon</span>
                      ) : (
                        <span className="badge badge-success badge-sm uppercase">On Schedule</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
