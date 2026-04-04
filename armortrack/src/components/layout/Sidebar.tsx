"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Package, 
  Layers, 
  Map, 
  Shield, 
  ClipboardList, 
  Wrench,
  ShieldCheck
} from 'lucide-react';
import { getUserRole } from '@/lib/auth';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  MANUFACTURER: ['assets', 'batches'],
  TRANSPORTER: ['batches'],
  WAREHOUSE: ['batches'],
  ADMIN: ['assets', 'batches', 'map', 'custody', 'maintenance', 'audit'],
  AUDITOR: ['audit'],
};

const navItems = [
  { name: 'Assets', icon: Package, path: '/dashboard/assets', permission: 'assets' },
  { name: 'Batches', icon: Layers, path: '/dashboard/batches', permission: 'batches' },
  { name: 'Live Map', icon: Map, path: '/dashboard/map', permission: 'map' },
  { name: 'Custody', icon: Shield, path: '/dashboard/custody', permission: 'custody' },
  { name: 'Audit', icon: ClipboardList, path: '/dashboard/audit', permission: 'audit' },
  { name: 'Maintenance', icon: Wrench, path: '/dashboard/maintenance', permission: 'maintenance' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const userRole = getUserRole() || 'ADMIN';
  const allowedPages = ROLE_PERMISSIONS[userRole] || [];

  return (
    <aside className="w-64 bg-base-200 border-r-2 border-primary/20 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b-2 border-primary/20">
        <Link href="/dashboard" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary-content" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-base-content uppercase tracking-wider">
              ArmorTrack
            </h1>
            <p className="text-xs text-base-content/60 uppercase">{userRole}</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="menu menu-vertical gap-2">
          {navItems.map((item) => {
            if (!allowedPages.includes(item.permission)) return null;
            
            const isActive = pathname === item.path;
            return (
              <li key={item.name}>
                <Link
                  href={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary text-primary-content font-bold'
                      : 'hover:bg-primary/10 text-base-content/80 hover:text-primary'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="uppercase tracking-wider text-sm">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t-2 border-primary/20">
        <div className="text-xs text-base-content/50 text-center uppercase tracking-wider">
          v1.0.0 - Military Grade
        </div>
      </div>
    </aside>
  );
}
