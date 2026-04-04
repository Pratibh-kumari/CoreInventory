export interface User {
  email: string;
  name: string;
  role: string;
}

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server';

  const existing = localStorage.getItem('device_fingerprint');
  if (existing) return existing;

  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(new Date().getTimezoneOffset()),
    String(window.screen.width),
    String(window.screen.height),
  ].join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  localStorage.setItem('device_fingerprint', fingerprint);
  return fingerprint;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('auth_token', token);
}

export function removeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('dismissed_alerts');
}

export function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('user_role');
}

export function setUserRole(role: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user_role', role);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
