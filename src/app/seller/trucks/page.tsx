'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import { getCurrentUser, setCurrentUser, getUsers, getTrucks } from '@/src/lib/demo-data';

export default function SellerTrucksPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [trucks, setTrucks] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    if (currentUser) {
      loadTrucks();
    }
  }, []);

  const loadTrucks = () => {
    const allTrucks = getTrucks();
    setTrucks(allTrucks);
  };

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      
      const routes: Record<string, string> = {
        PLATFORM_ADMIN: '/platform-admin/dashboard',
        SELLER_MANAGER: '/seller/dashboard',
        TRANSPORT_ADMIN: '/transport/dashboard',
        CLIENT: '/client/dashboard',
        DRIVER: '/driver/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'SELLER_MANAGER') {
    router.push('/');
    return null;
  }

  const filteredTrucks = filter === 'ALL' 
    ? trucks 
    : trucks.filter(t => t.status === filter);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">All Trucks</h1>
            <p className="text-gray-600">View and manage all registered trucks across transport providers</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Trucks</p>
              <p className="text-3xl font-bold text-gray-900">{trucks.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Idle</p>
              <p className="text-3xl font-bold text-green-600">
                {trucks.filter(t => t.status === 'IDLE').length}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-3xl font-bold text-blue-600">
                {trucks.filter(t => ['EN_ROUTE', 'ASSIGNED'].includes(t.status)).length}
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Pending Integration</p>
              <p className="text-3xl font-bold text-orange-600">
                {trucks.filter(t => t.status === 'PENDING_INTEGRATION').length}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              <button
                onClick={() => setFilter('ALL')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'ALL' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({trucks.length})
              </button>
              <button
                onClick={() => setFilter('IDLE')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'IDLE' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Idle ({trucks.filter(t => t.status === 'IDLE').length})
              </button>
              <button
                onClick={() => setFilter('EN_ROUTE')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'EN_ROUTE' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En Route ({trucks.filter(t => t.status === 'EN_ROUTE').length})
              </button>
              <button
                onClick={() => setFilter('PENDING_INTEGRATION')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'PENDING_INTEGRATION' 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({trucks.filter(t => t.status === 'PENDING_INTEGRATION').length})
              </button>
            </div>
          </div>

          {/* Trucks Grid */}
          {filteredTrucks.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTrucks.map((truck) => (
                <div key={truck.id} className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {truck.registrationNumber}
                      </h3>
                      <p className="text-sm text-gray-600">{truck.driverName}</p>
                    </div>
                    <StatusBadge status={truck.status} />
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <p className="text-gray-600">📞 {truck.driverPhone}</p>
                    <p className="text-gray-600">
                      📦 {truck.compartments?.length || 0} Compartments
                    </p>
                    <p className="text-gray-600">
                      💧 Capacity: {truck.capacity?.toLocaleString() || 0}L
                    </p>
                    <p className="text-gray-600">
                      📍 {truck.currentLat?.toFixed(4)}, {truck.currentLng?.toFixed(4)}
                    </p>
                  </div>

                  {truck.qrCode && (
                    <div className="mt-4">
                      <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                        ✓ QR Code Generated
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">🚛</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Trucks Found</h3>
              <p className="text-gray-600">
                {filter === 'ALL' 
                  ? 'No trucks registered in the system yet' 
                  : `No trucks with status "${filter}"`
                }
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
