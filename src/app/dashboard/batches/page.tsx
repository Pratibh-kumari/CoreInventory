"use client";

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, ChevronRight, CheckCircle, XCircle,
  Truck, Download, PackageCheck, ClipboardList, QrCode
} from 'lucide-react';
import { Batch, BatchAsset } from '@/types/batch';
import { getToken, getUserRole } from '@/lib/auth';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { badge: string; label: string }> = {
  PENDING:         { badge: 'badge-ghost',   label: 'Pending' },
  PENDING_PICKUP:  { badge: 'badge-warning',  label: 'Awaiting Pickup' },
  ACCEPTED:        { badge: 'badge-info',     label: 'Accepted' },
  IN_TRANSIT:      { badge: 'badge-primary',  label: 'In Transit' },
  DELIVERED:       { badge: 'badge-success',  label: 'Delivered' },
  CANCELLED:       { badge: 'badge-error',    label: 'Cancelled' },
};

const DESTINATION_OPTIONS = [
  { label: 'Army HQ, New Delhi', lat: 28.6139, lng: 77.2090 },
  { label: 'Central Command, Lucknow', lat: 26.8467, lng: 80.9462 },
  { label: 'Eastern Command, Kolkata', lat: 22.5726, lng: 88.3639 },
  { label: 'Northern Command, Udhampur', lat: 32.9253, lng: 75.1352 },
  { label: 'Southern Command, Pune', lat: 18.5204, lng: 73.8567 },
  { label: 'South Western Command, Jaipur', lat: 26.9124, lng: 75.7873 },
  { label: 'Western Command, Chandimandir', lat: 30.7333, lng: 76.8742 },
  { label: 'ARTRAC, Shimla', lat: 31.1048, lng: 77.1734 },
];

interface Asset {
  id: string;
  name?: string;
  asset_code?: string;
  asset_name?: string;
  status: string;
}

interface Driver {
  id: string;
  name: string;
  email?: string;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [destinationValue, setDestinationValue] = useState('');
  const [selectedDestinationPreset, setSelectedDestinationPreset] = useState('');
  const [acceptingBatch, setAcceptingBatch] = useState<Batch | null>(null);
  const [driverName, setDriverName] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const didAutoOpen = useRef(false);

  const role = getUserRole() || 'ADMIN';
  const token = getToken();
  const searchParams = useSearchParams();

  const fetchBatches = async () => {
    try {
      const response = await fetch('/api/batches', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setBatches(Array.isArray(data.batches) ? data.batches : []);
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const response = await fetch('/api/assets', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch {}
  };

  const fetchDrivers = async () => {
    try {
      const response = await fetch('/api/batches/drivers', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
    } catch {
      setDrivers([]);
    }
  };

  useEffect(() => {
    fetchBatches();
    if (role === 'MANUFACTURER' || role === 'ADMIN') fetchAssets();
    if (role === 'TRANSPORTER' || role === 'ADMIN') fetchDrivers();
  }, []);

  // Auto-open modal + pre-fill assets if redirected from Assets page
  useEffect(() => {
    if (didAutoOpen.current) return;
    if (loading) return;

    const shouldInitiate = searchParams.get('initiate') === '1';
    if (!shouldInitiate) return;

    const stored = sessionStorage.getItem('batchPreselectedAssets');
    if (stored) {
      try {
        const ids: string[] = JSON.parse(stored);
        if (ids.length > 0) {
          setSelectedAssetIds(ids);
        }
      } catch {}
      sessionStorage.removeItem('batchPreselectedAssets');
    }

    // Open only after render completes so the dialog exists in DOM.
    requestAnimationFrame(() => {
      const modal = document.getElementById('create_batch_modal') as HTMLDialogElement | null;
      if (modal && !modal.open) {
        modal.showModal();
        didAutoOpen.current = true;
      }
    });
  }, [searchParams, loading]);

  const handleInitiateBatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedAssetIds.length === 0) {
      toast.error('Select at least one asset');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const body = {
      assetIds: selectedAssetIds,
      transporterId: '',
      destination: formData.get('destination') as string,
      expectedDelivery: formData.get('expectedDelivery') as string,
    };
    try {
      setActionLoading('create');
      const response = await fetch('/api/batches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (response.ok) {
        if (result.batch?.qrGenerated) {
          toast.success('Batch initiated! QR codes generated in backend/qr_codes/.');
        } else {
          toast.error('Batch initiated, but QR generation failed or is unavailable.');
        }
        (document.getElementById('create_batch_modal') as HTMLDialogElement)?.close();
        setSelectedAssetIds([]);
        setSelectedDestinationPreset('');
        setDestinationValue('');
        (e.target as HTMLFormElement).reset();
        fetchBatches();
      } else {
        toast.error(result.error || 'Failed to create batch');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestDelivery = async (batch: Batch) => {
    try {
      setActionLoading(batch.id);
      const response = await fetch(`/api/batches/${batch.id}/request-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (response.ok) {
        toast.success('Delivery request sent to transporter!');
        fetchBatches();
      } else {
        toast.error(result.error || 'Failed to request delivery');
      }
    } catch {
      toast.error('Failed to request delivery');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptDelivery = async () => {
    if (!acceptingBatch || !driverName.trim()) {
      toast.error('Enter driver name');
      return;
    }
    try {
      setActionLoading(acceptingBatch.id);
      const response = await fetch(`/api/batches/${acceptingBatch.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ driver_name: driverName.trim() }),
      });
      const result = await response.json();
      if (response.ok) {
        toast.success(`Batch accepted! Driver ${driverName} assigned.`);
        (document.getElementById('accept_modal') as HTMLDialogElement)?.close();
        setAcceptingBatch(null);
        setDriverName('');
        fetchBatches();
      } else {
        toast.error(result.error || 'Failed to accept batch');
      }
    } catch {
      toast.error('Failed to accept batch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadQR = (batch: Batch) => {
    if (!token) {
      toast.error('Not authenticated');
      return;
    }

    const url = `/api/batches/${batch.id}/qr-preview?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  };

  const toggleAsset = (assetCode: string) => {
    setSelectedAssetIds(prev =>
      prev.includes(assetCode) ? prev.filter(id => id !== assetCode) : [...prev, assetCode]
    );
  };

  const handleDestinationPresetChange = (presetLabel: string) => {
    setSelectedDestinationPreset(presetLabel);
    const preset = DESTINATION_OPTIONS.find((option) => option.label === presetLabel);
    if (!preset) return;
    setDestinationValue(`${preset.label} (${preset.lat}, ${preset.lng})`);
  };

  const getStatusBadge = (status: string) => STATUS_CONFIG[status]?.badge || 'badge-ghost';
  const getStatusLabel = (status: string) => STATUS_CONFIG[status]?.label || status;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  // ─── MANUFACTURER VIEW ────────────────────────────────────────────────────
  if (role === 'MANUFACTURER') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
              My Batches
            </h1>
            <p className="text-base-content/60 mt-1">Initiate batch processing and request delivery</p>
          </div>
          <button
            onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.showModal()}
            className="btn btn-primary military-button"
          >
            <Plus className="w-5 h-5" />
            Initiate Batch
          </button>
        </div>

        {batches.length === 0 ? (
          <div className="card bg-base-100 shadow-xl military-card p-12 text-center">
            <PackageCheck className="w-16 h-16 text-base-content/20 mx-auto mb-4" />
            <p className="text-base-content/50 uppercase tracking-wider">No batches yet. Initiate your first batch.</p>
          </div>
        ) : (
          <div className="card bg-base-100 shadow-xl military-card">
            <div className="card-body p-0">
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr className="bg-base-200">
                      <th className="uppercase text-xs tracking-wider">Batch Code</th>
                      <th className="uppercase text-xs tracking-wider">Assets</th>
                      <th className="uppercase text-xs tracking-wider">Destination</th>
                      <th className="uppercase text-xs tracking-wider">Status</th>
                      <th className="uppercase text-xs tracking-wider">Created</th>
                      <th className="uppercase text-xs tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-base-200/50">
                        <td className="font-mono font-bold text-primary">
                          {batch.batchCode || batch.id.substring(0, 8).toUpperCase()}
                        </td>
                        <td>
                          <span className="badge badge-neutral badge-sm">{batch.assetsCount}</span>
                        </td>
                        <td>{batch.destination}</td>
                        <td>
                          <span className={`badge ${getStatusBadge(batch.status)} badge-sm font-semibold uppercase`}>
                            {getStatusLabel(batch.status)}
                          </span>
                        </td>
                        <td className="text-base-content/70 text-sm">
                          {new Date(batch.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          <div className="flex gap-2 flex-wrap">
                            {batch.status === 'PENDING' && (
                              <button
                                onClick={() => handleRequestDelivery(batch)}
                                disabled={actionLoading === batch.id}
                                className="btn btn-xs btn-warning military-button"
                              >
                                <Truck className="w-3 h-3" />
                                {actionLoading === batch.id ? '...' : 'Request Delivery'}
                              </button>
                            )}
                            {batch.qrGenerated && (
                              <button
                                onClick={() => handleDownloadQR(batch)}
                                className="btn btn-xs btn-ghost border border-base-300"
                              >
                                <QrCode className="w-3 h-3" />
                                QR Codes
                              </button>
                            )}
                            <button
                              onClick={() => { setSelectedBatch(batch); setDrawerOpen(true); }}
                              className="btn btn-xs btn-ghost"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Initiate Batch Modal */}
        <dialog id="create_batch_modal" className="modal">
          <div className="modal-box bg-base-100 military-card max-w-2xl">
            <button
              onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.close()}
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            >✕</button>
            <h3 className="font-bold text-xl uppercase tracking-wider mb-6">Initiate New Batch</h3>
            <p className="text-sm text-base-content/60 mb-4">
              Select assets, set destination and expected delivery. QR codes will be auto-generated upon initiation.
            </p>
            <form onSubmit={handleInitiateBatch} className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold uppercase text-sm">Select Assets</span>
                  <span className="label-text-alt">{selectedAssetIds.length} selected</span>
                </label>
                <div className="border border-base-300 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {assets.length === 0 ? (
                    <p className="text-sm text-base-content/50 p-2">No assets registered. Register assets first.</p>
                  ) : (
                    assets.map((asset) => (
                      <label key={asset.id} className="flex items-center gap-3 p-2 hover:bg-base-200 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={selectedAssetIds.includes(asset.asset_code || asset.id)}
                          onChange={() => toggleAsset(asset.asset_code || asset.id)}
                        />
                        <span className="font-mono text-xs text-primary">{asset.asset_code || asset.id}</span>
                        <span className="text-sm">{asset.asset_name || asset.name || 'Unnamed Asset'}</span>
                        <span className="badge badge-ghost badge-xs ml-auto">{asset.status}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold uppercase text-sm">Destination</span>
                </label>
                <select
                  className="select select-bordered w-full military-input mb-2"
                  value={selectedDestinationPreset}
                  onChange={(e) => handleDestinationPresetChange(e.target.value)}
                >
                  <option value="">Select a preset destination (with coordinates)</option>
                  {DESTINATION_OPTIONS.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label} [{option.lat}, {option.lng}]
                    </option>
                  ))}
                </select>
                <input
                  type="text" name="destination"
                  placeholder="e.g. Forward Operating Base Alpha"
                  className="input input-bordered w-full military-input"
                  value={destinationValue}
                  onChange={(e) => setDestinationValue(e.target.value)}
                  required
                />
                <p className="text-xs text-base-content/60 mt-2">
                  Presets use publicly listed command/cantonment city coordinates.
                </p>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-semibold uppercase text-sm">Expected Delivery</span>
                </label>
                <input type="datetime-local" name="expectedDelivery" className="input input-bordered w-full military-input" required />
              </div>

              <div className="modal-action">
                <button
                  type="button"
                  onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.close()}
                  className="btn btn-ghost"
                >Cancel</button>
                <button type="submit" className="btn btn-primary military-button" disabled={actionLoading === 'create'}>
                  {actionLoading === 'create' ? <span className="loading loading-spinner loading-sm"></span> : <QrCode className="w-4 h-4" />}
                  Initiate & Generate QR
                </button>
              </div>
            </form>
          </div>
          <form method="dialog" className="modal-backdrop"><button>close</button></form>
        </dialog>

        {/* Batch Detail Drawer */}
        <BatchDetailDrawer batch={selectedBatch} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    );
  }

  // ─── TRANSPORTER VIEW ─────────────────────────────────────────────────────
  if (role === 'TRANSPORTER') {
    const pendingRequests = batches.filter(b => b.status === 'PENDING_PICKUP');
    const activeDeliveries = batches.filter(b => ['ACCEPTED', 'IN_TRANSIT'].includes(b.status));
    const completed = batches.filter(b => b.status === 'DELIVERED');

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">Dispatch Management</h1>
          <p className="text-base-content/60 mt-1">Accept delivery requests and assign drivers</p>
        </div>

        {/* Pending Pickup Requests */}
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <h2 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="badge badge-warning">{pendingRequests.length}</span>
              Pending Pickup Requests
            </h2>
            {pendingRequests.length === 0 ? (
              <p className="text-base-content/50 text-sm py-4">No pending requests.</p>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr className="bg-base-200">
                      <th className="uppercase text-xs tracking-wider">Batch Code</th>
                      <th className="uppercase text-xs tracking-wider">Assets</th>
                      <th className="uppercase text-xs tracking-wider">Destination</th>
                      <th className="uppercase text-xs tracking-wider">Expected Delivery</th>
                      <th className="uppercase text-xs tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((batch) => (
                      <tr key={batch.id} className="hover:bg-base-200/50">
                        <td className="font-mono font-bold text-primary">
                          {batch.batchCode || batch.id.substring(0, 8).toUpperCase()}
                        </td>
                        <td><span className="badge badge-neutral badge-sm">{batch.assetsCount}</span></td>
                        <td>{batch.destination}</td>
                        <td className="text-sm text-base-content/70">{new Date(batch.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            onClick={() => {
                              setAcceptingBatch(batch);
                              (document.getElementById('accept_modal') as HTMLDialogElement)?.showModal();
                            }}
                            className="btn btn-xs btn-success military-button"
                          >
                            <Truck className="w-3 h-3" /> Accept & Assign Driver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Active Deliveries */}
        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body">
            <h2 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="badge badge-info">{activeDeliveries.length}</span>
              Active Deliveries
            </h2>
            {activeDeliveries.length === 0 ? (
              <p className="text-base-content/50 text-sm py-4">No active deliveries.</p>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr className="bg-base-200">
                      <th className="uppercase text-xs tracking-wider">Batch Code</th>
                      <th className="uppercase text-xs tracking-wider">Driver</th>
                      <th className="uppercase text-xs tracking-wider">Destination</th>
                      <th className="uppercase text-xs tracking-wider">Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDeliveries.map((batch) => (
                      <tr key={batch.id} className="hover:bg-base-200/50">
                        <td className="font-mono font-bold text-primary">
                          {batch.batchCode || batch.id.substring(0, 8).toUpperCase()}
                        </td>
                        <td>{batch.driverName || '—'}</td>
                        <td>{batch.destination}</td>
                        <td>
                          <span className={`badge ${getStatusBadge(batch.status)} badge-sm font-semibold uppercase`}>
                            {getStatusLabel(batch.status)}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => { setSelectedBatch(batch); setDrawerOpen(true); }} className="btn btn-xs btn-ghost">
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Accept Modal */}
        <dialog id="accept_modal" className="modal">
          <div className="modal-box bg-base-100 military-card">
            <button
              onClick={() => { (document.getElementById('accept_modal') as HTMLDialogElement)?.close(); setAcceptingBatch(null); setDriverName(''); }}
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            >✕</button>
            <h3 className="font-bold text-xl uppercase tracking-wider mb-4">Accept Delivery Request</h3>
            {acceptingBatch && (
              <div className="bg-base-200 rounded-lg p-3 mb-4 text-sm space-y-1">
                <p><span className="text-base-content/60">Batch:</span> <strong className="font-mono text-primary">{acceptingBatch.batchCode}</strong></p>
                <p><span className="text-base-content/60">Destination:</span> {acceptingBatch.destination}</p>
                <p><span className="text-base-content/60">Assets:</span> {acceptingBatch.assetsCount}</p>
              </div>
            )}
            <div className="form-control mb-4">
              <label className="label">
                <span className="label-text font-semibold uppercase text-sm">Assign Driver</span>
              </label>
              <select
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="input input-bordered w-full military-input"
              >
                <option value="">Select available driver</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.name}>
                    {driver.name}{driver.email ? ` (${driver.email})` : ''}
                  </option>
                ))}
              </select>
              {drivers.length === 0 && (
                <p className="text-xs text-base-content/60 mt-2">
                  No transporter users found in users table.
                </p>
              )}
            </div>
            <div className="modal-action">
              <button onClick={() => { (document.getElementById('accept_modal') as HTMLDialogElement)?.close(); setAcceptingBatch(null); setDriverName(''); }} className="btn btn-ghost">Cancel</button>
              <button onClick={handleAcceptDelivery} className="btn btn-success military-button" disabled={actionLoading === acceptingBatch?.id || !driverName.trim()}>
                {actionLoading === acceptingBatch?.id ? <span className="loading loading-spinner loading-sm"></span> : <Truck className="w-4 h-4" />}
                Confirm Acceptance
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button>close</button></form>
        </dialog>

        <BatchDetailDrawer batch={selectedBatch} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    );
  }

  // ─── WAREHOUSE VIEW ───────────────────────────────────────────────────────
  if (role === 'WAREHOUSE') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">Incoming Deliveries</h1>
          <p className="text-base-content/60 mt-1">Read-only view of deliveries assigned to warehouse</p>
        </div>

        <div className="card bg-base-100 shadow-xl military-card">
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr className="bg-base-200">
                    <th className="uppercase text-xs tracking-wider">Batch Code</th>
                    <th className="uppercase text-xs tracking-wider">Assets</th>
                    <th className="uppercase text-xs tracking-wider">Destination</th>
                    <th className="uppercase text-xs tracking-wider">Driver</th>
                    <th className="uppercase text-xs tracking-wider">Status</th>
                    <th className="uppercase text-xs tracking-wider">Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-base-content/50 py-8">No incoming deliveries.</td></tr>
                  ) : (
                    batches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-base-200/50 cursor-pointer" onClick={() => { setSelectedBatch(batch); setDrawerOpen(true); }}>
                        <td className="font-mono font-bold text-primary">
                          {batch.batchCode || batch.id.substring(0, 8).toUpperCase()}
                        </td>
                        <td><span className="badge badge-neutral badge-sm">{batch.assetsCount}</span></td>
                        <td>{batch.destination}</td>
                        <td>{batch.driverName || '—'}</td>
                        <td>
                          <span className={`badge ${getStatusBadge(batch.status)} badge-sm font-semibold uppercase`}>
                            {getStatusLabel(batch.status)}
                          </span>
                        </td>
                        <td className="text-sm text-base-content/70">{new Date(batch.createdAt).toLocaleDateString()}</td>
                        <td><ChevronRight className="w-4 h-4 text-base-content/40" /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <BatchDetailDrawer batch={selectedBatch} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    );
  }

  // ─── AUDITOR VIEW ─────────────────────────────────────────────────────────
  if (role === 'AUDITOR') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <ClipboardList className="w-16 h-16 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/50 uppercase tracking-wider">Use the Audit page for audit operations.</p>
        </div>
      </div>
    );
  }

  // ─── ADMIN VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">Batch Management</h1>
          <p className="text-base-content/60 mt-1">Admin — full batch oversight</p>
        </div>
        <button
          onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.showModal()}
          className="btn btn-primary military-button"
        >
          <Plus className="w-5 h-5" /> Create Batch
        </button>
      </div>

      <div className="card bg-base-100 shadow-xl military-card">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="bg-base-200">
                  <th className="uppercase text-xs tracking-wider">Batch Code</th>
                  <th className="uppercase text-xs tracking-wider">Assets</th>
                  <th className="uppercase text-xs tracking-wider">Transporter / Driver</th>
                  <th className="uppercase text-xs tracking-wider">Status</th>
                  <th className="uppercase text-xs tracking-wider">Destination</th>
                  <th className="uppercase text-xs tracking-wider">Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-base-200/50 cursor-pointer" onClick={() => { setSelectedBatch(batch); setDrawerOpen(true); }}>
                    <td className="font-mono font-bold text-primary">
                      {batch.batchCode || batch.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td><span className="badge badge-neutral badge-sm">{batch.assetsCount}</span></td>
                    <td>{batch.driverName || batch.transporter || '—'}</td>
                    <td>
                      <span className={`badge ${getStatusBadge(batch.status)} badge-sm font-semibold uppercase`}>
                        {getStatusLabel(batch.status)}
                      </span>
                    </td>
                    <td>{batch.destination}</td>
                    <td className="text-sm text-base-content/70">{new Date(batch.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-1">
                        {batch.qrGenerated && (
                          <button onClick={(e) => { e.stopPropagation(); handleDownloadQR(batch); }} className="btn btn-xs btn-ghost">
                            <QrCode className="w-3 h-3" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-base-content/40" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Admin Create Batch Modal */}
      <dialog id="create_batch_modal" className="modal">
        <div className="modal-box bg-base-100 military-card max-w-2xl">
          <button onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.close()} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
          <h3 className="font-bold text-xl uppercase tracking-wider mb-6">Create New Batch</h3>
          <form onSubmit={handleInitiateBatch} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text font-semibold uppercase text-sm">Select Assets</span><span className="label-text-alt">{selectedAssetIds.length} selected</span></label>
              <div className="border border-base-300 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                {assets.map((asset) => (
                  <label key={asset.id} className="flex items-center gap-3 p-2 hover:bg-base-200 rounded cursor-pointer">
                    <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={selectedAssetIds.includes(asset.asset_code || asset.id)} onChange={() => toggleAsset(asset.asset_code || asset.id)} />
                    <span className="font-mono text-xs text-primary">{asset.asset_code}</span>
                    <span className="text-sm">{asset.asset_name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-semibold uppercase text-sm">Destination</span></label>
              <input type="text" name="destination" placeholder="Enter destination" className="input input-bordered w-full military-input" required />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text font-semibold uppercase text-sm">Expected Delivery</span></label>
              <input type="datetime-local" name="expectedDelivery" className="input input-bordered w-full military-input" required />
            </div>
            <div className="modal-action">
              <button type="button" onClick={() => (document.getElementById('create_batch_modal') as HTMLDialogElement)?.close()} className="btn btn-ghost">Cancel</button>
              <button type="submit" className="btn btn-primary military-button" disabled={actionLoading === 'create'}>
                {actionLoading === 'create' ? <span className="loading loading-spinner loading-sm"></span> : <Plus className="w-4 h-4" />}
                Create Batch
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop"><button>close</button></form>
      </dialog>

      <BatchDetailDrawer batch={selectedBatch} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}


// ─── Shared Batch Detail Drawer ──────────────────────────────────────────────
function BatchDetailDrawer({ batch, open, onClose }: { batch: Batch | null; open: boolean; onClose: () => void }) {
  if (!batch) return null;

  const STATUS_CONFIG_LOCAL: Record<string, { badge: string; label: string }> = {
    PENDING:        { badge: 'badge-ghost',   label: 'Pending' },
    PENDING_PICKUP: { badge: 'badge-warning',  label: 'Awaiting Pickup' },
    ACCEPTED:       { badge: 'badge-info',     label: 'Accepted' },
    IN_TRANSIT:     { badge: 'badge-primary',  label: 'In Transit' },
    DELIVERED:      { badge: 'badge-success',  label: 'Delivered' },
    CANCELLED:      { badge: 'badge-error',    label: 'Cancelled' },
  };

  return (
    <div className={`drawer drawer-end ${open ? 'drawer-open' : ''}`} style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: open ? 'auto' : 'none' }}>
      <input id="batch-drawer" type="checkbox" className="drawer-toggle" checked={open} onChange={onClose} />
      <div className="drawer-content"></div>
      <div className="drawer-side">
        <label htmlFor="batch-drawer" className="drawer-overlay" onClick={onClose}></label>
        <div className="bg-base-100 min-h-full w-80 md:w-96 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold uppercase tracking-wider">Batch Details</h2>
            <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">✕</button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-base-content/60 uppercase">Batch Code</p>
              <p className="font-mono font-bold text-primary">{batch.batchCode || batch.id.substring(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-xs text-base-content/60 uppercase">Destination</p>
              <p className="font-semibold">{batch.destination}</p>
            </div>
            <div>
              <p className="text-xs text-base-content/60 uppercase">Status</p>
              <span className={`badge ${STATUS_CONFIG_LOCAL[batch.status]?.badge || 'badge-ghost'} font-semibold uppercase`}>
                {STATUS_CONFIG_LOCAL[batch.status]?.label || batch.status}
              </span>
            </div>
            {batch.driverName && (
              <div>
                <p className="text-xs text-base-content/60 uppercase">Assigned Driver</p>
                <p className="font-semibold">{batch.driverName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-base-content/60 uppercase">QR Codes</p>
              <p className={`text-sm font-semibold ${batch.qrGenerated ? 'text-success' : 'text-base-content/40'}`}>
                {batch.qrGenerated ? '✓ Generated' : 'Not generated'}
              </p>
            </div>

            <div className="divider"></div>

            <h3 className="font-bold uppercase tracking-wider text-sm">Assets in Batch ({batch.assetsCount})</h3>
            <div className="space-y-2">
              {(batch.assets || []).map((asset) => (
                <div key={asset.assetId} className="card bg-base-200 p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-mono text-xs text-primary">{asset.assetId}</p>
                      <p className="text-sm">{asset.assetName}</p>
                    </div>
                    {asset.scanStatus === 'SCANNED' ? (
                      <div className="flex items-center gap-1 text-success">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase">Scanned</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-warning">
                        <XCircle className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase">Not Scanned</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(!batch.assets || batch.assets.length === 0) && (
                <p className="text-sm text-base-content/50">No asset details available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
