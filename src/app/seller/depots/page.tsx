'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, setCurrentUser, getUsers } from '@/src/lib/demo-data';

export default function DepotsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (!currentUser || currentUser.role !== 'SELLER_MANAGER') {
      router.push('/');
    }
  }, []);

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      router.push('/seller/dashboard');
    }
  };

  if (!mounted || !user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Depot Management</h1>
            <p className="text-gray-600">Manage your depot locations and geofences</p>
          </div>

          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <span className="text-6xl mb-4 block">🏭</span>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-gray-600 mb-6">Depot management features will be available here</p>
            
            <div className="bg-blue-50 rounded-lg p-6 max-w-2xl mx-auto text-left">
              <h4 className="font-semibold text-blue-900 mb-3">📍 Current Depot:</h4>
              <div className="space-y-2 text-sm text-blue-800">
                <p><strong>Name:</strong> Oman Seeb Central Depot</p>
                <p><strong>Location:</strong> Seeb, Muscat, Oman</p>
                <p><strong>Coordinates:</strong> 23.670250, 58.189120</p>
                <p><strong>Geofence Radius:</strong> 200 meters</p>
              </div>
            </div>
            
            <button
              onClick={() => router.push('/seller/dashboard')}
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
