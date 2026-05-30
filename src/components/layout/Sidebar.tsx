'use client';

import { useRouter, usePathname } from 'next/navigation';
import { UserRole } from '@/src/types';
import { logout } from '@/src/lib/demo-data';

const navigationMap: Record<UserRole, Array<{ name: string; path: string; icon: string }>> = {
  PLATFORM_ADMIN: [
    { name: 'Dashboard',          path: '/platform-admin/dashboard',          icon: '🏠' },
    { name: 'Sensor Integration', path: '/platform-admin/sensor-integration', icon: '🔧' },
    { name: 'Tickets',            path: '/platform-admin/tickets',            icon: '🎫' },
    { name: 'Trucks',             path: '/platform-admin/trucks',             icon: '🚛' },
    { name: 'Users',              path: '/platform-admin/users',              icon: '👥' },
    { name: 'Reports',            path: '/platform-admin/reports',            icon: '📊' },
  ],

  SELLER_MANAGER: [
    { name: 'Dashboard',       path: '/seller/dashboard',       icon: '🏠' },
    { name: 'Orders',          path: '/seller/orders',          icon: '📦' },
    { name: 'KYC Review',      path: '/seller/kyc-review',      icon: '📄' },
    { name: 'Sensor Requests', path: '/seller/sensor-requests', icon: '🎫' },
    { name: 'Fleet Monitor',   path: '/seller/fleet-monitor',   icon: '🗺️' },
    { name: 'Invite TSP',      path: '/seller/invite-tsp',      icon: '✉️' },
    { name: 'Transporters',    path: '/seller/transporters',    icon: '🚛' },
    { name: 'Reports',         path: '/seller/reports',         icon: '📊' },
  ],

  TRANSPORT_ADMIN: [
    { name: 'Dashboard',       path: '/transport/dashboard',       icon: '🏠' },
    { name: 'My Trucks',       path: '/transport/trucks',          icon: '🚛' },
    { name: 'Register Truck',  path: '/transport/trucks/register', icon: '➕' },
    { name: 'Orders',          path: '/transport/orders',          icon: '📦' },
    { name: 'KYC Upload',      path: '/transport/kyc-upload',      icon: '📄' },
    { name: 'Tickets',         path: '/transport/tickets',         icon: '🎫' },
    { name: 'Drivers',         path: '/transport/drivers',         icon: '👥' },
    { name: 'Reports',         path: '/transport/reports',         icon: '📊' },
  ],

  CLIENT: [
    { name: 'Dashboard',   path: '/client/dashboard',   icon: '🏠' },
    { name: 'Place Order', path: '/client/orders/new',  icon: '➕' },
    { name: 'My Orders',   path: '/client/orders',      icon: '📦' },
    { name: 'Fuel Tanks',  path: '/client/tanks',       icon: '🛢️' },
    { name: 'Reports',     path: '/client/reports',     icon: '📊' },
  ],

  DRIVER: [
    { name: 'Dashboard',        path: '/driver/dashboard', icon: '🏠' },
    { name: 'Active Delivery',  path: '/driver/active-delivery', icon: '🚛' },
    { name: 'Delivery History', path: '/driver/history',   icon: '📦' },
    { name: 'My Profile',       path: '/driver/profile',   icon: '👤' },
  ],
};

const roleColors: Record<UserRole, string> = {
  PLATFORM_ADMIN:  'text-purple-600 bg-purple-100',
  SELLER_MANAGER:  'text-blue-600 bg-blue-100',
  TRANSPORT_ADMIN: 'text-orange-600 bg-orange-100',
  CLIENT:          'text-emerald-600 bg-emerald-100',
  DRIVER:          'text-teal-600 bg-teal-100',
};

const roleLabels: Record<UserRole, string> = {
  PLATFORM_ADMIN:  'Platform Admin',
  SELLER_MANAGER:  'Seller Manager',
  TRANSPORT_ADMIN: 'Transport Admin',
  CLIENT:          'Client',
  DRIVER:          'Driver',
};

const EXACT_MATCH_PATHS = new Set([
  '/client/orders/new',
  '/transport/trucks/register',
]);

export default function Sidebar({ userRole }: { userRole: UserRole }) {
  const router   = useRouter();
  const pathname = usePathname();

  const navigation = navigationMap[userRole] ?? [];

  function isActive(itemPath: string): boolean {
    if (pathname === itemPath) return true;
    if (EXACT_MATCH_PATHS.has(itemPath)) return false;
    return pathname.startsWith(itemPath + '/');
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-100 min-h-screen flex flex-col shadow-sm flex-shrink-0">

      {/* Logo */}
      <div
        className="p-5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition"
        onClick={() => router.push('/')}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold">
            ⛽
          </div>
          <div>
            <h2 className="text-base font-black text-gray-900 tracking-tight">FuelFleet</h2>
            <p className="text-xs text-gray-400 font-medium tracking-widest uppercase">ANPTCO</p>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-5 py-3 border-b border-gray-50">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${roleColors[userRole] || 'bg-gray-100 text-gray-600'}`}>
          {roleLabels[userRole]}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        <ul className="space-y-0.5">
          {navigation.map(item => {
            const active = isActive(item.path);
            return (
              <li key={item.path}>
                <button
                  onClick={() => router.push(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                    active
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base leading-none w-5 text-center">{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={() => { logout(); router.push('/'); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
