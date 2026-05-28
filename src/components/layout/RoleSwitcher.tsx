// src/components/layout/RoleSwitcher.tsx
'use client';

import { useState } from 'react';
import { getUsers, setCurrentUser } from '@/src/lib/demo-data';
import { UserRole } from '@/src/types';

export default function RoleSwitcher({
  currentRole,
  onRoleChange,
}: {
  currentRole: UserRole;
  onRoleChange: (userId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const users = getUsers();

  const roleLabels: Record<UserRole, string> = {
    PLATFORM_ADMIN:  '👨‍💼 Platform Admin',
    SELLER_MANAGER:  '🏢 Seller Manager',
    TRANSPORT_ADMIN: '🚛 Transport Admin',
    CLIENT:          '🏪 Client',
    DRIVER:          '🚗 Driver',
  };

  const roleColors: Record<UserRole, string> = {
    PLATFORM_ADMIN:  'bg-purple-100 text-purple-700',
    SELLER_MANAGER:  'bg-blue-100 text-blue-700',
    TRANSPORT_ADMIN: 'bg-green-100 text-green-700',
    CLIENT:          'bg-orange-100 text-orange-700',
    DRIVER:          'bg-gray-100 text-gray-700',
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-4 py-2 rounded-lg font-medium text-sm ${roleColors[currentRole]} hover:opacity-80 transition-opacity`}
      >
        {roleLabels[currentRole]} ▼
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="p-3 border-b border-gray-200">
              <p className="text-xs text-gray-600 font-semibold">SWITCH ROLE (DEMO)</p>
            </div>
            <div className="p-2">
              {users.map((u: any) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onRoleChange(u.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors mb-1 ${
                    u.role === currentRole ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-600">{roleLabels[u.role as UserRole]}</p>
                    </div>
                    {u.role === currentRole && (
                      <span className="text-green-600">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}