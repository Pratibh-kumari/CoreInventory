"use client";

import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { getToken, getUserRole } from '@/lib/auth';
import toast from 'react-hot-toast';

interface AuditLog {
  id: string;
  eventType: string;
  timestamp: string;
  entryHash: string;
  prevHash: string;
}

export default function AuditPage() {
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{status: string, message?: string, entryId?: string} | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const userRole = getUserRole();

  useEffect(() => {
    fetchAuditLogs();
  }, [currentPage]);

  const fetchAuditLogs = async () => {
    try {
      const token = getToken();
      const response = await fetch(`/api/audit/logs?page=${currentPage}&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const runVerification = async () => {
    setLoading(true);
    setVerificationResult(null);

    try {
      const token = getToken();
      const response = await fetch('/api/audit/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setVerificationResult(data);
      
      if (data.status === 'OK') {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error: any) {
      toast.error('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Role check
  if (userRole !== 'AUDITOR') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="alert alert-error max-w-md">
          <AlertTriangle className="w-6 h-6" />
          <div>
            <h3 className="font-bold">Access Denied</h3>
            <p className="text-sm">This page is restricted to AUDITOR role only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
          Audit & Verification
        </h1>
        <p className="text-base-content/60 mt-1">
          Verify blockchain integrity and view audit logs
        </p>
      </div>

      {/* Verification Button */}
      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body">
          <button
            onClick={runVerification}
            className="btn btn-primary btn-lg military-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner"></span>
                Verifying...
              </>
            ) : (
              <>
                <ShieldCheck className="w-6 h-6" />
                Run Audit Verification
              </>
            )}
          </button>

          {/* Verification Result */}
          {verificationResult && (
            <div className={`alert ${verificationResult.status === 'OK' ? 'alert-success' : 'alert-error'} mt-4`}>
              {verificationResult.status === 'OK' ? (
                <>
                  <ShieldCheck className="w-6 h-6" />
                  <div>
                    <h3 className="font-bold uppercase">Chain Intact</h3>
                    <p>{verificationResult.message}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-6 h-6" />
                  <div>
                    <h3 className="font-bold uppercase">TAMPERED</h3>
                    <p>{verificationResult.message}</p>
                    {verificationResult.entryId && (
                      <p className="text-sm mt-2">Entry ID: {verificationResult.entryId}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body">
          <h2 className="text-xl font-bold uppercase tracking-wider mb-4">Audit Log Entries</h2>
          
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="bg-base-200">
                  <th className="uppercase tracking-wider text-sm">ID</th>
                  <th className="uppercase tracking-wider text-sm">Event Type</th>
                  <th className="uppercase tracking-wider text-sm">Timestamp</th>
                  <th className="uppercase tracking-wider text-sm">Entry Hash</th>
                  <th className="uppercase tracking-wider text-sm">Prev Hash</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono font-bold text-primary">{log.id}</td>
                    <td className="uppercase">{log.eventType}</td>
                    <td className="text-base-content/70">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="font-mono text-xs">{log.entryHash.substring(0, 16)}...</td>
                    <td className="font-mono text-xs">{log.prevHash.substring(0, 16)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-center gap-2 mt-4">
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <span className="px-4 py-2">Page {currentPage}</span>
            <button
              className="btn btn-sm"
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
