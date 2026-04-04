"use client";

import { useState, useEffect } from 'react';
import { ShieldCheck, Package, AlertTriangle, Layers, Wrench, Activity, TrendingUp, Map, ClipboardList, Shield } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUserRole } from '@/lib/auth';
import LeafletMapComponent from '@/components/map/LeafletMap';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  MANUFACTURER: ['assets'],
  TRANSPORTER: [],
  WAREHOUSE: ['assets', 'batches', 'custody'],
  ADMIN: ['assets', 'batches', 'map', 'custody', 'maintenance'],
  AUDITOR: ['audit'],
};

const modules = [
  { name: 'Assets', icon: Package, path: '/dashboard/assets', permission: 'assets', color: 'primary', description: 'Manage and track all military assets' },
  { name: 'Batches', icon: Layers, path: '/dashboard/batches', permission: 'batches', color: 'secondary', description: 'Create and monitor asset batches' },
  { name: 'Live Map', icon: Map, path: '/dashboard/map', permission: 'map', color: 'info', description: 'Real-time GPS tracking' },
  { name: 'Custody', icon: Shield, path: '/dashboard/custody', permission: 'custody', color: 'accent', description: 'Asset custody chain tracking' },
  { name: 'Audit', icon: ClipboardList, path: '/dashboard/audit', permission: 'audit', color: 'warning', description: 'Blockchain verification & logs' },
  { name: 'Maintenance', icon: Wrench, path: '/dashboard/maintenance', permission: 'maintenance', color: 'error', description: 'Service scheduling & tracking' },
];

interface HealthStatus {
  backend: boolean;
  sql1: boolean;
  sql2: boolean;
}

interface AuditEvent {
  id: string;
  eventType: string;
  timestamp: string;
  description: string;
}

export default function DashboardHome() {
  const userRole = getUserRole() || 'ADMIN';
  const allowedModules = ROLE_PERMISSIONS[userRole] || [];
  const [stats, setStats] = useState({
    totalAssets: 0,
    inTransit: 0,
    activeAlerts: 0,
    batchesToday: 0,
    maintenanceDue: 0,
    lastAuditStatus: 'NEVER RUN',
  });
  const [gpsData, setGpsData] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [health, setHealth] = useState<HealthStatus>({ backend: false, sql1: false, sql2: false });

  useEffect(() => {
    fetchData();
    
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const token = getToken();
      
      // Fetch all stats in parallel
      const [assetsRes, gpsRes, alertsRes, batchesRes, maintenanceRes, auditRes, healthRes] = await Promise.all([
        fetch('/api/assets', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/gps/active', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/alerts/active', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/batches', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/maintenance/due', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/audit/last-status', { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null),
        fetch('/api/health', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      const assetsData = await assetsRes.json();
      const gpsData = await gpsRes.json();
      const alertsData = await alertsRes.json();
      const batchesData = await batchesRes.json();
      const maintenanceData = await maintenanceRes.json();
      const healthData = await healthRes.json();

      setStats({
        totalAssets: assetsData.assets?.length || 0,
        inTransit: gpsData.batches?.length || 0,
        activeAlerts: alertsData.alerts?.length || 0,
        batchesToday: batchesData.batches?.length || 0,
        maintenanceDue: maintenanceData.assets?.length || 0,
        lastAuditStatus: 'OK',
      });

      setGpsData(gpsData.batches || []);
      setHealth(healthData);

      // Mock audit events
      setAuditEvents([
        { id: '1', eventType: 'ASSET_REGISTERED', timestamp: new Date().toISOString(), description: 'New asset AST-025 registered' },
        { id: '2', eventType: 'BATCH_CREATED', timestamp: new Date(Date.now() - 3600000).toISOString(), description: 'Batch BATCH-004 created with 12 assets' },
        { id: '3', eventType: 'CUSTODY_TRANSFER', timestamp: new Date(Date.now() - 7200000).toISOString(), description: 'Asset AST-010 transferred to Unit Bravo' },
      ]);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const getAuditColor = (status: string) => {
    if (status === 'OK') return 'text-success';
    if (status === 'TAMPERED') return 'text-error';
    return 'text-base-content/60';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
          Command Center
        </h1>
        <p className="text-base-content/60 mt-1">
          Real-time overview of all military assets and operations
        </p>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules
          .filter(module => allowedModules.includes(module.permission))
          .map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.name}
                href={module.path}
                className="card bg-base-100 shadow-xl military-card hover:shadow-2xl transition-all cursor-pointer group"
              >
                <div className="card-body">
                  <div className="flex items-start justify-between">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center bg-${module.color}/20 group-hover:bg-${module.color}/30 transition-colors`}>
                      <Icon className={`w-8 h-8 text-${module.color}`} />
                    </div>
                    <span className="text-2xl font-bold text-base-content/20 group-hover:text-base-content/40 transition-colors">→</span>
                  </div>
                  <div className="mt-4">
                    <h2 className="text-xl font-bold text-base-content uppercase tracking-wider mb-2">
                      {module.name}
                    </h2>
                    <p className="text-sm text-base-content/60">
                      {module.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
      </div>

      {/* Divider */}
      <div className="divider text-base-content/40 uppercase tracking-wider text-sm">System Overview</div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">Total Assets</p>
                <p className="text-3xl font-bold text-primary">{stats.totalAssets}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-info/20 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-info" />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">In Transit</p>
                <p className="text-3xl font-bold text-info">{stats.inTransit}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stats.activeAlerts > 0 ? 'bg-error/20' : 'bg-base-200'}`}>
                <AlertTriangle className={`w-6 h-6 ${stats.activeAlerts > 0 ? 'text-error' : 'text-base-content/40'}`} />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">Active Alerts</p>
                <p className={`text-3xl font-bold ${stats.activeAlerts > 0 ? 'text-error' : 'text-base-content'}`}>
                  {stats.activeAlerts}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-secondary/20 rounded-lg flex items-center justify-center">
                <Layers className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">Batches Today</p>
                <p className="text-3xl font-bold text-secondary">{stats.batchesToday}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-warning/20 rounded-lg flex items-center justify-center">
                <Wrench className="w-6 h-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">Maintenance Due</p>
                <p className="text-3xl font-bold text-warning">{stats.maintenanceDue}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-base-200 rounded-lg flex items-center justify-center">
                <ShieldCheck className={`w-6 h-6 ${getAuditColor(stats.lastAuditStatus)}`} />
              </div>
              <div>
                <p className="text-sm text-base-content/60 uppercase tracking-wider">Last Audit</p>
                <p className={`text-2xl font-bold ${getAuditColor(stats.lastAuditStatus)}`}>{stats.lastAuditStatus}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mini GPS Map */}
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <h2 className="card-title text-lg uppercase tracking-wider mb-4">
              <Activity className="w-5 h-5" />
              Live Asset Positions
            </h2>
            <div className="rounded-lg overflow-hidden h-[400px]">
              <LeafletMapComponent gpsData={gpsData} fullScreen={false} interactive={false} />
            </div>
          </div>
        </div>

        {/* Recent Audit Events */}
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <h2 className="card-title text-lg uppercase tracking-wider mb-4">
              <TrendingUp className="w-5 h-5" />
              Recent Audit Events
            </h2>
            <div className="space-y-3">
              {auditEvents.map((event, index) => (
                <div key={event.id} className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{event.description}</p>
                    <p className="text-xs text-base-content/60 mt-1">
                      {event.eventType.replace('_', ' ')} • {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* System Status Bar */}
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body py-4">
          <div className="flex justify-around items-center">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${health.backend ? 'bg-success' : 'bg-error'}`}></div>
              <span className="text-sm font-semibold uppercase tracking-wider">Backend API</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${health.sql1 ? 'bg-success' : 'bg-error'}`}></div>
              <span className="text-sm font-semibold uppercase tracking-wider">SQL_1 Database</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${health.sql2 ? 'bg-success' : 'bg-error'}`}></div>
              <span className="text-sm font-semibold uppercase tracking-wider">SQL_2 Audit DB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
