"use client";

import { useState } from 'react';
import { getToken } from '@/lib/auth';
import toast from 'react-hot-toast';

interface RegisterAssetModalProps {
  onAssetRegistered: () => void;
}

export default function RegisterAssetModal({ onAssetRegistered }: RegisterAssetModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = getToken();
      const response = await fetch('/api/assets/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, type }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register asset');
      }

      toast.success(data.message);
      setName('');
      setType('');
      
      // Close modal
      const modal = document.getElementById('register_asset_modal') as HTMLDialogElement;
      if (modal) modal.close();
      
      onAssetRegistered();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    const modal = document.getElementById('register_asset_modal') as HTMLDialogElement;
    if (modal) modal.close();
  };

  return (
    <dialog id="register_asset_modal" className="modal">
      <div className="modal-box bg-base-100 military-card">
        <button onClick={handleClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        
        <h3 className="font-bold text-xl uppercase tracking-wider mb-6">Register New Asset</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold uppercase text-sm">Asset Name</span>
            </label>
            <input
              type="text"
              placeholder="Enter asset name"
              className="input input-bordered w-full military-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold uppercase text-sm">Asset Type</span>
            </label>
            <select
              className="select select-bordered w-full military-input"
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
            >
              <option value="" disabled>Select asset type</option>
              <option value="Weapon System">Weapon System</option>
              <option value="Vehicle">Vehicle</option>
              <option value="Communication Device">Communication Device</option>
              <option value="Surveillance Equipment">Surveillance Equipment</option>
              <option value="Protective Gear">Protective Gear</option>
            </select>
          </div>

          <div className="modal-action">
            <button type="button" onClick={handleClose} className="btn btn-ghost mr-2">Cancel</button>
            <button
              type="submit"
              className="btn btn-primary military-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  Registering...
                </>
              ) : (
                'Register Asset'
              )}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
