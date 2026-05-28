'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/demo-data';
import { DRIVER_POOL, TRUCK_POOL, getAvailableDrivers } from '@/src/lib/driver-pool';

const MAX_DRIVERS = 10;

export default function SelectDriversPage() {
  const router = useRouter();
  const [user,            setUser]            = useState<any>(null);
  const [mounted,         setMounted]         = useState(false);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [myDrivers,       setMyDrivers]       = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser || currentUser.role !== 'TRANSPORT_ADMIN') {
      router.push('/');
      return;
    }
    setMyDrivers(getAvailableDrivers(currentUser.id));
  }, []);

  if (!mounted || !user) return null;

  // ── Read pool from localStorage so transporterId persists ──
  const getPool = (): any[] => {
    if (typeof window === 'undefined') return DRIVER_POOL;
    const stored = localStorage.getItem('driver_pool');
    return stored ? JSON.parse(stored) : DRIVER_POOL;
  };

  const availableDrivers = getPool().filter((d: any) => !d.transporterId);
  const remainingSlots   = MAX_DRIVERS - myDrivers.length;

  const handleSelectDriver = (driverId: string) => {
    if (selectedDrivers.includes(driverId)) {
      setSelectedDrivers(selectedDrivers.filter(id => id !== driverId));
    } else {
      if (myDrivers.length + selectedDrivers.length >= MAX_DRIVERS) {
        alert(`❌ You can only select maximum ${MAX_DRIVERS} drivers`);
        return;
      }
      setSelectedDrivers([...selectedDrivers, driverId]);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedDrivers.length === 0) {
      alert('Please select at least one driver');
      return;
    }
    const updatedPool = getPool().map((d: any) =>
      selectedDrivers.includes(d.id) ? { ...d, transporterId: user?.id } : d
    );
    localStorage.setItem('driver_pool', JSON.stringify(updatedPool));
    alert(`✅ Successfully selected ${selectedDrivers.length} driver(s)!`);
    router.push('/transport/drivers');
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <button
              onClick={() => router.push('/transport/drivers')}
              className="text-blue-600 hover:text-blue-700 mb-4 block"
            >
              ← Back to My Drivers
            </button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Drivers from Pool</h1>
            <p className="text-gray-600">Choose drivers with pre-assigned trucks (Max {MAX_DRIVERS} drivers)</p>
          </div>

          {/* Selection Status */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-blue-900 mb-1">Driver Selection Status</h3>
                <p className="text-blue-800 text-sm">
                  You have selected <strong>{myDrivers.length + selectedDrivers.length}/{MAX_DRIVERS}</strong> drivers
                </p>
                <p className="text-blue-700 text-xs mt-1">
                  {remainingSlots > 0 ? `${remainingSlots} slots remaining` : 'Maximum limit reached'}
                </p>
              </div>
              {selectedDrivers.length > 0 && (
                <button
                  onClick={handleConfirmSelection}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
                >
                  ✓ Confirm Selection ({selectedDrivers.length})
                </button>
              )}
            </div>
          </div>

          {/* Available Drivers Grid */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Available Drivers ({availableDrivers.length})
            </h2>

            {availableDrivers.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableDrivers.map((driver: any) => {
                  const truck      = TRUCK_POOL.find(t => t.id === driver.assignedTruckId);
                  const isSelected = selectedDrivers.includes(driver.id);

                  return (
                    <button
                      key={driver.id}
                      onClick={() => handleSelectDriver(driver.id)}
                      disabled={!isSelected && remainingSlots === 0}
                      className={`text-left p-4 border-2 rounded-lg transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : remainingSlots === 0
                          ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">
                            👤
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {driver.firstName} {driver.lastName}
                            </h3>
                            <p className="text-xs text-gray-600">{driver.username}</p>
                          </div>
                        </div>
                        {isSelected && <span className="text-blue-600 text-2xl">✓</span>}
                      </div>

                      <div className="space-y-1 text-sm mb-3">
                        <p className="text-gray-600">📞 {driver.phone}</p>
                        <p className="text-gray-600">🪪 {driver.licenseNumber}</p>
                      </div>

                      {truck && (
                        <div className="bg-gray-100 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Assigned Truck:</p>
                          <p className="font-semibold text-sm">{truck.registrationNumber}</p>
                          <p className="text-xs text-gray-600">{truck.model}</p>
                          <p className="text-xs text-gray-600">
                            Capacity: {truck.capacity.toLocaleString()}L
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-6xl mb-4 block">🚫</span>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Drivers Available</h3>
                <p className="text-gray-600">All drivers from the pool have been selected by transporters</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}