'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import { getCurrentUser, getTrucks, updateTruck } from '@/src/lib/demo-data';

export default function AdminTrucksPage() {
  const router = useRouter();
  const [user,          setUser]          = useState<any>(null);
  const [mounted,       setMounted]       = useState(false);
  const [trucks,        setTrucks]        = useState<any[]>([]);
  const [filter,        setFilter]        = useState<string>('ALL');
  const [selectedTruck, setSelectedTruck] = useState<any>(null);
  const [searchQuery,   setSearchQuery]   = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (currentUser) loadTrucks();
  }, []);

  const loadTrucks = () => setTrucks(getTrucks());

  if (!mounted) return null;
  if (!user)                          { router.push('/'); return null; }
  if (user.role !== 'PLATFORM_ADMIN') { router.push('/'); return null; }

  // ── Handlers ──────────────────────────────────────────────
  const handleDeactivate = (truckId: string) => {
    if (!confirm('⚠️ Are you sure you want to deactivate this truck?')) return;
    updateTruck(truckId, { status: 'IDLE' }); // sets to IDLE as proxy for deactivated
    loadTrucks();
    alert('✅ Truck deactivated successfully');
    setSelectedTruck(null);
  };

  const handleActivate = (truckId: string) => {
    updateTruck(truckId, { status: 'IDLE' });
    loadTrucks();
    alert('✅ Truck activated successfully');
    setSelectedTruck(null);
  };

  // ── Derived ───────────────────────────────────────────────
  let filteredTrucks = filter === 'ALL' ? trucks : trucks.filter(t => t.status === filter);

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredTrucks = filteredTrucks.filter(t =>
      t.registrationNumber?.toLowerCase().includes(q) ||
      t.driverName?.toLowerCase().includes(q) ||
      t.tspName?.toLowerCase().includes(q)
    );
  }

  const totalTrucks       = trucks.length;
  const idleTrucks        = trucks.filter(t => t.status === 'IDLE').length;
  const activeTrucks      = trucks.filter(t => ['EN_ROUTE', 'ASSIGNED'].includes(t.status)).length;
  const pendingTrucks     = trucks.filter(t => t.status === 'PENDING_INTEGRATION').length;
  const deactivatedTrucks = trucks.filter(t => t.status === 'DEACTIVATED').length;
  const enRouteTrucks     = trucks.filter(t => t.status === 'EN_ROUTE').length;

  // Group by TSP — typed accumulator fixes the 'unknown' error
  const trucksByTSP = trucks.reduce<Record<string, any[]>>((acc, truck) => {
    const key = truck.tspName || 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(truck);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">All Trucks 🚛</h1>
            <p className="text-gray-600">Monitor and manage all registered trucks across the platform</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-6 mb-8">
            {[
              { label: 'Total Trucks',   value: totalTrucks,       color: 'text-gray-900'   },
              { label: 'Idle',           value: idleTrucks,        color: 'text-green-600'  },
              { label: 'Active',         value: activeTrucks,      color: 'text-blue-600'   },
              { label: 'Pending Setup',  value: pendingTrucks,     color: 'text-orange-600' },
              { label: 'Deactivated',    value: deactivatedTrucks, color: 'text-red-600'    },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-6 border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center gap-4 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 Search by truck number, driver, or TSP..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              {[
                { key: 'ALL',                 label: `All (${totalTrucks})`,        active: 'bg-blue-600'   },
                { key: 'IDLE',                label: `Idle (${idleTrucks})`,        active: 'bg-green-600'  },
                { key: 'EN_ROUTE',            label: `En Route (${enRouteTrucks})`, active: 'bg-blue-600'   },
                { key: 'PENDING_INTEGRATION', label: `Pending (${pendingTrucks})`,  active: 'bg-orange-600' },
                { key: 'DEACTIVATED',         label: `Deactivated (${deactivatedTrucks})`, active: 'bg-red-600' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === f.key ? `${f.active} text-white` : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* TSP Summary */}
          {Object.keys(trucksByTSP).length > 0 && (
            <div className="bg-white rounded-lg p-6 mb-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Trucks by Transport Provider</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {Object.entries(trucksByTSP).map(([tspName, tspTrucks]) => (
                  <div key={tspName} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="font-semibold text-gray-900 mb-2">{tspName}</p>
                    <p className="text-2xl font-bold text-blue-600">{tspTrucks.length}</p>
                    <p className="text-xs text-gray-500">
                      {tspTrucks.filter((t: any) => t.status === 'IDLE').length} idle •{' '}
                      {tspTrucks.filter((t: any) => ['EN_ROUTE', 'ASSIGNED'].includes(t.status)).length} active
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trucks Grid */}
          {filteredTrucks.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTrucks.map(truck => (
                <div
                  key={truck.id}
                  className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all cursor-pointer"
                  onClick={() => setSelectedTruck(truck)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{truck.registrationNumber}</h3>
                      <p className="text-sm text-gray-600">{truck.driverName}</p>
                      <p className="text-xs text-blue-600 font-medium">{truck.tspName}</p>
                    </div>
                    <StatusBadge status={truck.status} />
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <p className="text-gray-600">📞 {truck.driverPhone}</p>
                    <p className="text-gray-600">📦 {truck.compartments?.length || 0} Compartments</p>
                    <p className="text-gray-600">💧 Capacity: {truck.capacity?.toLocaleString() || 0}L</p>
                    {truck.currentLat && truck.currentLng && (
                      <p className="text-gray-600">
                        📍 {truck.currentLat.toFixed(4)}, {truck.currentLng.toFixed(4)}
                      </p>
                    )}
                  </div>

                  {truck.qrCodeId && (
                    <span className="inline-block bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                      ✓ QR Code Generated
                    </span>
                  )}
                  {truck.status === 'DEACTIVATED' && (
                    <span className="inline-block bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-medium mt-2">
                      ⚠️ Deactivated
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">🚛</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Trucks Found</h3>
              <p className="text-gray-600">
                {searchQuery
                  ? `No trucks matching "${searchQuery}"`
                  : filter === 'ALL'
                  ? 'No trucks registered in the system yet'
                  : `No trucks with status "${filter}"`}
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Truck Detail Modal */}
      {selectedTruck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedTruck.registrationNumber}</h2>
                <p className="text-sm text-gray-600">Truck ID: {selectedTruck.id}</p>
              </div>
              <button onClick={() => setSelectedTruck(null)} className="text-gray-500 hover:text-gray-700 text-2xl">
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Status</p>
                <StatusBadge status={selectedTruck.status} />
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Transport Provider</p>
                <p className="font-semibold text-lg">{selectedTruck.tspName ?? '—'}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Driver Information</p>
                <p className="font-semibold">{selectedTruck.driverName}</p>
                <p className="text-sm text-gray-600 mt-1">📞 {selectedTruck.driverPhone}</p>
                {selectedTruck.driverLicense && (
                  <p className="text-sm text-gray-600">🪪 {selectedTruck.driverLicense}</p>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">
                  Compartments ({selectedTruck.compartments?.length || 0})
                </p>
                {selectedTruck.compartments?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTruck.compartments.map((comp: any) => (
                      <div key={comp.id} className="flex items-center justify-between bg-white p-2 rounded">
                        <span className="text-sm font-medium">Compartment {comp.id}</span>
                        <span className="text-sm text-gray-600">
                          {comp.capacity?.toLocaleString()}L • {comp.fuelType ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No compartments configured</p>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Total Capacity</p>
                <p className="text-2xl font-bold text-blue-600">
                  {selectedTruck.capacity?.toLocaleString() || 0} Liters
                </p>
              </div>

              {selectedTruck.currentLat && selectedTruck.currentLng && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Current Location</p>
                  <p className="font-mono text-sm">
                    📍 {selectedTruck.currentLat.toFixed(6)}, {selectedTruck.currentLng.toFixed(6)}
                  </p>
                </div>
              )}

              {selectedTruck.qrCodeId && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-green-800 font-medium mb-1">✓ QR Code Generated</p>
                  <p className="text-xs text-green-700">Driver can scan QR code to link truck in mobile app</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600">
                  Registered: {selectedTruck.createdAt
                    ? new Date(selectedTruck.createdAt).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {selectedTruck.status !== 'DEACTIVATED' ? (
                <button
                  onClick={() => handleDeactivate(selectedTruck.id)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  🚫 Deactivate Truck
                </button>
              ) : (
                <button
                  onClick={() => handleActivate(selectedTruck.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  ✅ Activate Truck
                </button>
              )}
              <button
                onClick={() => setSelectedTruck(null)}
                className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}