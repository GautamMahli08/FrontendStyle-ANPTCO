'use client';

import { useRouter, usePathname } from 'next/navigation';
import { UserRole } from '@/src/types';
import { signOut } from '@/src/lib/auth';
import OomcoLogo from '@/src/components/assets/OomcoLogo';

const nav: Record<UserRole, Array<{ name: string; path: string; icon: string }>> = {
  PLATFORM_ADMIN: [
    { name: 'Dashboard',          path: '/platform-admin/dashboard',          icon: '🏠' },
    { name: 'Sensor Integration', path: '/platform-admin/sensor-integration', icon: '🔧' },
    { name: 'Tickets',            path: '/platform-admin/tickets',            icon: '🎫' },
    { name: 'Trucks',             path: '/platform-admin/trucks',             icon: '🚛' },
    { name: 'Users',              path: '/platform-admin/users',              icon: '👥' },
  ],

  SELLER_MANAGER: [
    { name: 'Dashboard',       path: '/seller/dashboard',       icon: '🏠' },
    { name: 'Orders',          path: '/seller/orders',          icon: '📦' },
    { name: 'Fleet Monitor',   path: '/seller/fleet-monitor',   icon: '🗺️' },
    { name: 'KYC Review',      path: '/seller/kyc-review',      icon: '📄' },
    { name: 'Transporters',    path: '/seller/transporters',    icon: '🚛' },
  ],

  TRANSPORT_ADMIN: [
    { name: 'Dashboard',       path: '/transport/dashboard',              icon: '🏠' },
    { name: 'Orders',          path: '/transport/orders',                 icon: '📦' },
    { name: 'Fleet Monitor',   path: '/transport/fleet-monitor',          icon: '🗺️' },
    { name: 'My Trucks',       path: '/transport/trucks',                 icon: '🚛' },
    { name: 'Connect Seller',  path: '/transport/trucks/connect-seller',  icon: '🔗' },
    { name: 'Drivers',         path: '/transport/drivers',                icon: '👥' },
  ],

  CLIENT: [
    { name: 'Dashboard',        path: '/client/dashboard',          icon: '🏠' },
    { name: 'Place Order',      path: '/client/orders/new',         icon: '➕' },
    { name: 'My Orders',        path: '/client/orders',             icon: '📦' },
    { name: 'Confirm Delivery', path: '/client/delivery/scan-qr',   icon: '📷' },
    { name: 'Fuel Stations',    path: '/client/tanks',              icon: '⛽' },
  ],

  DRIVER: [
    { name: 'Dashboard',       path: '/driver/dashboard',       icon: '🏠' },
    { name: 'Active Delivery', path: '/driver/active-delivery', icon: '🚛' },
  ],
};

const ROLE_LABEL: Record<UserRole, string> = {
  PLATFORM_ADMIN:  'Platform Admin',
  SELLER_MANAGER:  'Seller Manager',
  TRANSPORT_ADMIN: 'Transport Admin',
  CLIENT:          'Client',
  DRIVER:          'Driver',
};
const ROLE_DOT: Record<UserRole, string> = {
  PLATFORM_ADMIN:  'bg-purple-500',
  SELLER_MANAGER:  'bg-blue-500',
  TRANSPORT_ADMIN: 'bg-orange-500',
  CLIENT:          'bg-emerald-500',
  DRIVER:          'bg-teal-500',
};

// Nav items that only match their exact path (no prefix matching)
const EXACT = new Set(['/client/orders/new', '/client/orders', '/transport/trucks', '/transport/trucks/register', '/transport/trucks/connect-seller']);
const EXACT_PAGES = new Set(['/client/orders/new', '/client/delivery/scan-qr', '/transport/trucks/register', '/transport/trucks/connect-seller']);

export default function Sidebar({ role }: { role: UserRole }) {
  const router   = useRouter();
  const pathname = usePathname();
  const items    = nav[role] ?? [];

  function isActive(path: string) {
    if (pathname === path) return true;
    if (EXACT.has(path)) return false;
    // If current page is "owned" by an exact nav item, disable prefix matching entirely
    if (EXACT_PAGES.has(pathname)) return false;
    return pathname.startsWith(path + '/');
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-100 min-h-screen flex flex-col shadow-sm flex-shrink-0">

      {/* Logo */}
     <button
  onClick={() => router.push('/')}
  className="flex items-center justify-center px-5 py-5 border-b border-gray-100 hover:bg-gray-50 transition w-full"
>
  <OomcoLogo className="w-15 h-8 flex-shrink-0" />

  <div>
    {/* Future text here */}
  </div>
</button>

      {/* Role pill */}
      <div className="px-5 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ROLE_DOT[role] ?? 'bg-gray-400'}`} />
          <span className="text-xs font-semibold text-gray-500">{ROLE_LABEL[role]}</span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-3">
        <ul className="space-y-0.5">
          {items.map(item => {
            const active = isActive(item.path);
            return (
              <li key={item.path}>
                <button
                  onClick={() => router.push(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                    active
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="w-5 text-base text-center leading-none">{item.icon}</span>
                  {item.name}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={() => signOut().then(() => router.push('/'))}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition text-sm font-medium"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
