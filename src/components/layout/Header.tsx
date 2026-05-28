'use client';

import { logout } from '@/src/lib/demo-data';
import { User } from '@/src/types';
import { useRouter } from 'next/navigation';

export default function Header({ user }: { user: User }) {
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {user.firstName} {user.lastName}
          </h2>
          <p className="text-sm text-gray-600">{user.email}</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </header>
  );
}