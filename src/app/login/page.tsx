"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';
import { setToken, setUserRole, getOrCreateDeviceFingerprint } from '@/lib/auth';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const deviceFingerprint = await getOrCreateDeviceFingerprint();
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, device_fingerprint: deviceFingerprint }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setToken(data.token);
      setUserRole(data.user.role);
      
      toast.success('Login successful!');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
      <div className="card w-full max-w-md bg-base-100 shadow-2xl military-card">
        <div className="card-body">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-4">
              <Shield className="w-10 h-10 text-primary-content" />
            </div>
            <h1 className="text-3xl font-bold text-base-content uppercase tracking-wider">
              ArmorTrack
            </h1>
            <p className="text-sm text-base-content/60 mt-2">
              Military Asset Management System
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert alert-error mb-4">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold uppercase text-sm">Email</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" />
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="input input-bordered w-full pl-10 military-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold uppercase text-sm">Password</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/40" />
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="input input-bordered w-full pl-10 military-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-control mt-6">
              <button
                type="submit"
                className="btn btn-primary military-button"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner"></span>
                    Authenticating...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
