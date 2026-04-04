"use client";

import { useState, useEffect } from 'react';
import { Bell, LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getToken, getUserRole, removeToken } from '@/lib/auth';
import toast from 'react-hot-toast';

interface Alert {
  id: string;
  type: string;
  batchId?: string;
  assetId?: string;
  timestamp: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

export default function Navbar() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const userRole = getUserRole();

  const fetchAlerts = async () => {
    try {
      const token = getToken();
      const response = await fetch('/api/alerts/active', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!response.ok) {
        console.error('Failed to fetch alerts:', response.status);
        setAlerts([]);
        setUnreadCount(0);
        return;
      }
      
      const data = await response.json();
      
      // Ensure data.alerts exists and is an array
      const alertsList = Array.isArray(data.alerts) ? data.alerts : [];
      
      const dismissedAlerts = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
      const activeAlerts = alertsList.filter((a: Alert) => !dismissedAlerts.includes(a.id));
      
      setAlerts(activeAlerts);
      setUnreadCount(activeAlerts.length);

      // Show modal for CRITICAL alerts
      const criticalAlerts = activeAlerts.filter((a: Alert) => a.severity === 'CRITICAL');
      if (criticalAlerts.length > 0) {
        const modal = document.getElementById('critical_alert_modal') as HTMLDialogElement;
        if (modal && !modal.open) {
          modal.showModal();
        }
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      setAlerts([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = async (alertId: string) => {
    try {
      const token = getToken();
      await fetch(`/api/alerts/${alertId}/dismiss`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const dismissed = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
      dismissed.push(alertId);
      localStorage.setItem('dismissed_alerts', JSON.stringify(dismissed));
      
      fetchAlerts();
      toast.success('Alert dismissed');
    } catch (error) {
      toast.error('Failed to dismiss alert');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  const getSeverityBadge = (severity: string) => {
    const config = {
      CRITICAL: 'badge-error',
      WARNING: 'badge-warning',
      INFO: 'badge-ghost',
    };
    return config[severity as keyof typeof config] || 'badge-ghost';
  };

  return (
    <>
      <nav className="bg-base-200 border-b-2 border-primary/20 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-base-content uppercase tracking-wider">
            ArmorTrack Command Center
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {/* Alerts Bell */}
          <div className={`dropdown dropdown-end ${showDropdown ? 'dropdown-open' : ''}`}>
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle relative"
              onClick={() => setShowDropdown(!showDropdown)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            >
              <Bell className="w-6 h-6" />
              {unreadCount > 0 && (
                <span className="badge badge-error badge-sm absolute -top-1 -right-1">
                  {unreadCount}
                </span>
              )}
            </div>
            
            <div className="dropdown-content z-[1] card card-compact w-80 p-2 shadow-lg bg-base-100 mt-2">
              <div className="card-body">
                <h3 className="font-bold uppercase tracking-wider text-sm">Active Alerts</h3>
                {alerts.length === 0 ? (
                  <p className="text-sm text-base-content/60">No active alerts</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="card bg-base-200 p-3">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`badge ${getSeverityBadge(alert.severity)} badge-sm uppercase`}>
                            {alert.severity}
                          </span>
                          <button
                            onClick={() => handleDismiss(alert.id)}
                            className="btn btn-xs btn-ghost"
                          >
                            Dismiss
                          </button>
                        </div>
                        <p className="text-sm font-semibold">{alert.type.replace('_', ' ')}</p>
                        <p className="text-xs text-base-content/60">
                          {alert.batchId || alert.assetId} • {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* User Profile */}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost gap-2">
              <User className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase">{userRole}</span>
            </div>
            <ul tabIndex={0} className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 mt-2">
              <li>
                <button onClick={handleLogout} className="text-error">
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Critical Alert Modal */}
      {alerts.some(a => a.severity === 'CRITICAL') && (
        <dialog id="critical_alert_modal" className="modal">
          <div className="modal-box bg-base-100 border-4 border-error">
            <div className="flex items-center gap-4 mb-4">
              <Bell className="w-12 h-12 text-error" />
              <h3 className="font-bold text-2xl text-error uppercase">Critical Alert</h3>
            </div>
            <p className="py-4">
              {alerts.filter(a => a.severity === 'CRITICAL').length} critical alert(s) require immediate attention.
            </p>
            <div className="modal-action">
              <button
                onClick={() => {
                  const modal = document.getElementById('critical_alert_modal') as HTMLDialogElement;
                  if (modal) modal.close();
                }}
                className="btn btn-error military-button"
              >
                Acknowledge
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
