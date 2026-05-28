// src/components/layout/Sidebar.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { UserRole } from '@/src/types';

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
    { name: 'TSP',             path: '/seller/invite-tsp',      icon: '✉️' },
    { name: 'Reports',         path: '/seller/reports',         icon: '📊' },
    { name: 'Transporters',         path: '/seller/transporters',         icon: '🚛' },

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
    { name: 'Dashboard',        path: '/driver/dashboard',       icon: '🏠' },
    { name: 'Active Delivery',  path: '/driver/active-delivery', icon: '🚛' },
    { name: 'Delivery History', path: '/driver/history',         icon: '📦' },
    { name: 'My Profile',       path: '/driver/profile',         icon: '👤' },
  ],
};

const roleLabels: Record<UserRole, string> = {
  PLATFORM_ADMIN:  'Platform Admin',
  SELLER_MANAGER:  'Seller / Manager',
  TRANSPORT_ADMIN: 'Transport Admin',
  CLIENT:          'Client',
  DRIVER:          'Driver',
};

const roleTips: Record<UserRole, { title: string; body: string }> = {
  PLATFORM_ADMIN:  { title: '🛡️ Admin Mode',      body: 'Full system access enabled.'            },
  SELLER_MANAGER:  { title: '📦 Seller Portal',    body: 'Manage orders & KYC approvals.'         },
  TRANSPORT_ADMIN: { title: '🚛 Transport Portal', body: 'Manage trucks, drivers & trips.'        },
  CLIENT:          { title: '⛽ Client Portal',    body: 'Order fuel & track your tanks.'         },
  DRIVER:          { title: '🧭 Driver Mode',      body: 'View and manage active deliveries.'     },
};

// Items that should only match exact path (prevent sub-routes stealing active state)
const EXACT_MATCH_PATHS = new Set([
  '/client/orders/new',
  '/transport/trucks/register',
]);

export default function Sidebar({ userRole }: { userRole: UserRole }) {
  const router   = useRouter();
  const pathname = usePathname();

  const navigation = navigationMap[userRole] ?? [];
  const tip        = roleTips[userRole];

  function isActive(itemPath: string): boolean {
    if (pathname === itemPath) return true;
    if (EXACT_MATCH_PATHS.has(itemPath)) return false;
    return pathname.startsWith(itemPath + '/');
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">

      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⛽</span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">FuelFleet</h2>
            <p className="text-xs text-gray-500">{roleLabels[userRole]}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {navigation.map(item => {
            const active = isActive(item.path);
            return (
              <li key={item.path}>
                <button
                  onClick={() => router.push(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600 pl-3'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Tip Panel */}
      <div className="p-4 border-t border-gray-200">
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-blue-800 font-semibold mb-1">{tip.title}</p>
          <p className="text-xs text-blue-600 leading-snug">{tip.body}</p>
        </div>
      </div>

    </aside>
  );
}
