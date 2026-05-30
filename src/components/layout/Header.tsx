'use client';

import { logout } from '@/src/lib/demo-data';
import { User } from '@/src/types';
import { useRouter } from 'next/navigation';
import DemoBanner from './DemoBanner';
import NotificationBell from './NotificationBell';

const ROLE_LABEL: Record<string, string> = {
  PLATFORM_ADMIN:  'Platform Admin',
  SELLER_MANAGER:  'Seller Manager',
  TRANSPORT_ADMIN: 'Transport Admin',
  CLIENT:          'Client',
  DRIVER:          'Driver',
};
const ROLE_COLOR: Record<string, string> = {
  PLATFORM_ADMIN:  'bg-purple-100 text-purple-700',
  SELLER_MANAGER:  'bg-blue-100   text-blue-700',
  TRANSPORT_ADMIN: 'bg-orange-100 text-orange-700',
  CLIENT:          'bg-emerald-100 text-emerald-700',
  DRIVER:          'bg-teal-100   text-teal-700',
};

export default function Header({ user }: { user: User }) {
  const router = useRouter();

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-3 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center justify-between gap-4">

        {/* User info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-gray-900 truncate">
                {user.firstName} {user.lastName}
              </p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Notification bell — only for roles that receive notifications */}
          {['SELLER_MANAGER', 'TRANSPORT_ADMIN', 'CLIENT', 'PLATFORM_ADMIN'].includes(user.role) && (
            <NotificationBell userId={user.id} />
          )}

          {/* Demo role switcher */}
          <DemoBanner currentUserId={user.id} />

          {/* Sign out */}
          <button
            onClick={() => { logout(); router.push('/'); }}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
