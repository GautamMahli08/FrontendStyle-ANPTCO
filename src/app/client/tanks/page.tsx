// src/app/client/tanks/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, getDeliveryLocations } from '@/src/lib/demo-data';

// ── Types ─────────────────────────────────────────────────────
interface Tank {
  id: string;
  clientId: string;
  name: string;
  fuelType: string;
  capacity: number;
  currentLevel: number;
  minLevel: number;
  reorderAlert: boolean;
  lastRefilled: Date;
  createdAt: Date;
}

// ── localStorage helpers ──────────────────────────────────────
const TANKS_KEY = 'fuelfleet_tanks';

function getTanksFromStorage(clientId: string): Tank[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TANKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw)
      .filter((t: any) => t.clientId === clientId)
      .map((t: any) => ({
        ...t,
        lastRefilled: new Date(t.lastRefilled),
        createdAt:    new Date(t.createdAt),
      }));
  } catch {
    return [];
  }
}

function saveAllTanks(tanks: Tank[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Preserve tanks of OTHER clients, only overwrite this client's
    const raw   = localStorage.getItem(TANKS_KEY);
    const all: Tank[] = raw ? JSON.parse(raw) : [];
    const otherClientTanks = all.filter(
      (t: any) => t.clientId !== tanks[0]?.clientId
    );
    localStorage.setItem(
      TANKS_KEY,
      JSON.stringify([...otherClientTanks, ...tanks])
    );
  } catch (e) {
    console.error('Failed to save tanks:', e);
  }
}

// ── Seed data ─────────────────────────────────────────────────
function getSeedTanks(clientId: string): Tank[] {
  return [
    {
      id:           'tank-1',
      clientId,
      name:         'Main Diesel Tank',
      fuelType:     'DIESEL',
      capacity:     25000,
      currentLevel: 4500,
      minLevel:     5000,
      reorderAlert: true,
      lastRefilled: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      createdAt:    new Date(),
    },
    {
      id:           'tank-2',
      clientId,
      name:         'Petrol Tank A',
      fuelType:     'PETROL',
      capacity:     15000,
      currentLevel: 3200,
      minLevel:     2000,
      reorderAlert: false,
      lastRefilled: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdAt:    new Date(),
    },
    {
      id:           'tank-3',
      clientId,
      name:         'Premium Fuel Tank',
      fuelType:     'PREMIUM',
      capacity:     10000,
      currentLevel: 8000,
      minLevel:     3000,
      reorderAlert: false,
      lastRefilled: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      createdAt:    new Date(),
    },
  ];
}

// ─────────────────────────────────────────────────────────────
export default function ClientTanksPage() {
  const router = useRouter();
  const [user,             setUser]             = useState<any>(null);
  const [mounted,          setMounted]          = useState(false);
  const [tanks,            setTanks]            = useState<Tank[]>([]);
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [editingTank,      setEditingTank]      = useState<Tank | null>(null);
  const [showReorderModal, setShowReorderModal] = useState(false);

  // Form state
  const [tankName,     setTankName]     = useState('');
  const [fuelType,     setFuelType]     = useState('DIESEL');
  const [capacity,     setCapacity]     = useState('');
  const [currentLevel, setCurrentLevel] = useState('');
  const [minLevel,     setMinLevel]     = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser)                      { router.push('/'); return; }
    if (currentUser.role !== 'CLIENT')     { router.push('/'); return; }
    setUser(currentUser);
    loadTanks(currentUser);
  }, [router]);

  // ── Load ────────────────────────────────────────────────────
  const loadTanks = (currentUser: any) => {
    let stored = getTanksFromStorage(currentUser.id);

    if (stored.length === 0) {
      // First visit — seed demo tanks
      const seed = getSeedTanks(currentUser.id);
      saveAllTanks(seed);
      stored = seed;
    }

    // Always recalculate reorder alerts on load
    const withAlerts = stored.map(t => ({
      ...t,
      reorderAlert: t.currentLevel <= t.minLevel,
    }));
    setTanks(withAlerts);
  };

  // ── Persist helper ──────────────────────────────────────────
  const persistTanks = (updated: Tank[]) => {
    const withAlerts = updated.map(t => ({
      ...t,
      reorderAlert: t.currentLevel <= t.minLevel,
    }));
    saveAllTanks(withAlerts);
    setTanks(withAlerts);
  };

  // ── Add ─────────────────────────────────────────────────────
  const handleAddTank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tankName || !capacity || !currentLevel || !minLevel) {
      alert('Please fill in all fields');
      return;
    }

    const newTank: Tank = {
      id:           `tank-${Date.now()}`,
      clientId:     user.id,
      name:         tankName,
      fuelType,
      capacity:     parseInt(capacity),
      currentLevel: parseInt(currentLevel),
      minLevel:     parseInt(minLevel),
      reorderAlert: parseInt(currentLevel) <= parseInt(minLevel),
      lastRefilled: new Date(),
      createdAt:    new Date(),
    };

    persistTanks([...tanks, newTank]);
    setShowAddModal(false);
    resetForm();
  };

  // ── Edit ────────────────────────────────────────────────────
  const handleUpdateTank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTank) return;

    const updated: Tank = {
      ...editingTank,
      name:         tankName,
      fuelType,
      capacity:     parseInt(capacity),
      currentLevel: parseInt(currentLevel),
      minLevel:     parseInt(minLevel),
      reorderAlert: parseInt(currentLevel) <= parseInt(minLevel),
    };

    persistTanks(tanks.map(t => (t.id === updated.id ? updated : t)));
    setEditingTank(null);
    resetForm();
  };

  const openEditModal = (tank: Tank) => {
    setEditingTank(tank);
    setTankName(tank.name);
    setFuelType(tank.fuelType);
    setCapacity(String(tank.capacity));
    setCurrentLevel(String(tank.currentLevel));
    setMinLevel(String(tank.minLevel));
  };

  // ── Delete ──────────────────────────────────────────────────
  const handleDeleteTank = (tankId: string) => {
    if (!confirm('Are you sure you want to remove this tank?')) return;
    persistTanks(tanks.filter(t => t.id !== tankId));
  };

  // ── Quick Order ─────────────────────────────────────────────
  const handleQuickOrder = (tank: Tank) => {
    const reorderAmount = tank.capacity - tank.currentLevel;
    router.push(
      `/client/orders/new?preFill=${encodeURIComponent(
        JSON.stringify({
          fuelType:  tank.fuelType,
          volume:    reorderAmount,
          tankName:  tank.name,
          tankId:    tank.id,           // ← pass tankId so order can update it
        })
      )}`
    );
  };

  const resetForm = () => {
    setTankName('');
    setFuelType('DIESEL');
    setCapacity('');
    setCurrentLevel('');
    setMinLevel('');
  };

  // ── Util ────────────────────────────────────────────────────
  const pct   = (current: number, cap: number) => Math.round((current / cap) * 100);
  const days  = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

  const fuelBadgeClass = (ft: string) =>
    ft === 'DIESEL'  ? 'bg-blue-100 text-blue-700'   :
    ft === 'PETROL'  ? 'bg-green-100 text-green-700'  :
    ft === 'PREMIUM' ? 'bg-purple-100 text-purple-700' :
                       'bg-gray-100 text-gray-700';

  const barColor = (p: number, alert: boolean) =>
    alert       ? 'bg-red-500'    :
    p < 30      ? 'bg-orange-400' :
    p < 60      ? 'bg-yellow-400' :
                  'bg-green-500';

  if (!mounted || !user) return null;

  const tanksNeedingReorder = tanks.filter(t => t.reorderAlert);
  const totalCapacity       = tanks.reduce((s, t) => s + t.capacity, 0);
  const totalCurrent        = tanks.reduce((s, t) => s + t.currentLevel, 0);
  const overallFill         = totalCapacity > 0 ? Math.round((totalCurrent / totalCapacity) * 100) : 0;

  // ── Shared Form Modal ────────────────────────────────────────
  const TankFormModal = ({
    title,
    onSubmit,
    onClose,
  }: {
    title: string;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
  }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tank Name</label>
            <input
              value={tankName}
              onChange={e => setTankName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Main Diesel Tank"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
            <select
              value={fuelType}
              onChange={e => setFuelType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="DIESEL">Diesel</option>
              <option value="PETROL">Petrol</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Capacity (L)',      val: capacity,     set: setCapacity,     ph: '25000' },
              { label: 'Current Level (L)', val: currentLevel, set: setCurrentLevel, ph: '12000' },
              { label: 'Min Level (L)',     val: minLevel,     set: setMinLevel,     ph: '5000'  },
            ].map(({ label, val, set, ph }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={ph}
                  required
                  min={0}
                />
              </div>
            ))}
          </div>

          {/* Live preview bar */}
          {currentLevel && capacity && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600 mb-1">
                Fill Level Preview:{' '}
                <span className="font-semibold">
                  {pct(parseInt(currentLevel) || 0, parseInt(capacity) || 1)}%
                </span>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(pct(parseInt(currentLevel) || 0, parseInt(capacity) || 1), 100)}%` }}
                />
              </div>
              {parseInt(currentLevel) <= parseInt(minLevel || '0') && minLevel && (
                <p className="text-xs text-red-500 mt-1">⚠️ Current level is at or below minimum — reorder alert will trigger</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
              {title.includes('Edit') ? 'Save Changes' : 'Add Tank'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── Reorder All Modal ────────────────────────────────────────
  const ReorderAllModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-bold text-gray-900">🛒 Reorder All Low Tanks</h3>
          <button onClick={() => setShowReorderModal(false)}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            These tanks are below their minimum level. Place an order for each:
          </p>
          {tanksNeedingReorder.map(tank => {
            const needed = tank.capacity - tank.currentLevel;
            const p      = pct(tank.currentLevel, tank.capacity);
            return (
              <div key={tank.id}
                className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div>
                  <p className="font-semibold text-gray-900">{tank.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tank.currentLevel.toLocaleString()} / {tank.capacity.toLocaleString()} L ({p}%)
                  </p>
                  <p className="text-sm text-orange-600 font-medium">
                    Needs ~{needed.toLocaleString()} L of {tank.fuelType}
                  </p>
                </div>
                <button
                  onClick={() => { setShowReorderModal(false); handleQuickOrder(tank); }}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors ml-4">
                  Order Now
                </button>
              </div>
            );
          })}
          <button onClick={() => setShowReorderModal(false)}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main Render ──────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} /> 

        <main className="p-8">

          {/* Title row */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Fuel Tanks 🛢️</h1>
              <p className="text-gray-500">Monitor inventory levels and reorder smartly</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => loadTanks(user)}
                className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                🔄 Refresh
              </button>
              {tanksNeedingReorder.length > 0 && (
                <button onClick={() => setShowReorderModal(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
                  🛒 Reorder All ({tanksNeedingReorder.length})
                </button>
              )}
              <button
                onClick={() => { resetForm(); setEditingTank(null); setShowAddModal(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
                + Add Tank
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
              <p className="text-sm opacity-80 mb-2">Overall Fill</p>
              <p className="text-3xl font-bold mb-2">{overallFill}%</p>
              <div className="w-full bg-white bg-opacity-30 rounded-full h-2.5">
                <div className="bg-white h-2.5 rounded-full" style={{ width: `${overallFill}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-500 mb-1">Total Capacity</p>
              <p className="text-3xl font-bold text-gray-900">{totalCapacity.toLocaleString()} L</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-500 mb-1">Current Fuel</p>
              <p className="text-3xl font-bold text-green-600">{totalCurrent.toLocaleString()} L</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-sm text-gray-500 mb-1">Needs Reorder</p>
              <p className={`text-3xl font-bold ${tanksNeedingReorder.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {tanksNeedingReorder.length}/{tanks.length}
              </p>
            </div>
          </div>

          {/* Low tanks alert section */}
          {tanksNeedingReorder.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  ⚠️ Tanks Needing Reorder ({tanksNeedingReorder.length})
                </h2>
                <button onClick={() => setShowReorderModal(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
                  🛒 Reorder All
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tanksNeedingReorder.map(tank => {
                  const p      = pct(tank.currentLevel, tank.capacity);
                  const needed = tank.capacity - tank.currentLevel;
                  return (
                    <div key={tank.id} className="bg-white border-2 border-red-200 rounded-xl p-6 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="inline-block bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full mb-2">
                            🔴 REORDER NEEDED
                          </span>
                          <h3 className="text-lg font-bold text-gray-900">{tank.name}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${fuelBadgeClass(tank.fuelType)}`}>
                            {tank.fuelType}
                          </span>
                        </div>
                        <span className="text-2xl font-bold text-red-600">{p}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
                        <div className="bg-red-500 h-3 rounded-full" style={{ width: `${p}%` }} />
                      </div>
                      <div className="text-sm space-y-1 mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Current</span>
                          <span className="font-semibold text-red-600">{tank.currentLevel.toLocaleString()} L</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Minimum</span>
                          <span className="font-semibold">{tank.minLevel.toLocaleString()} L</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Suggested order</span>
                          <span className="font-semibold text-orange-600">{needed.toLocaleString()} L</span>
                        </div>
                      </div>
                      <button onClick={() => handleQuickOrder(tank)}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
                        🛒 Quick Order
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All tanks grid */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">All Tanks ({tanks.length})</h2>

            {tanks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
                <div className="text-6xl mb-4">🛢️</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Tanks Added Yet</h3>
                <p className="text-gray-500 mb-6">Add your first fuel tank to start monitoring.</p>
                <button onClick={() => { resetForm(); setShowAddModal(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors">
                  + Add First Tank
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tanks.map(tank => {
                  const p   = pct(tank.currentLevel, tank.capacity);
                  const d   = days(tank.lastRefilled);
                  const bc  = barColor(p, tank.reorderAlert);

                  return (
                    <div key={tank.id}
                      className={`bg-white rounded-xl border-2 ${tank.reorderAlert ? 'border-red-200' : 'border-gray-200'} p-6 shadow-sm hover:shadow-md transition-shadow`}>

                      {/* Card header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{tank.name}</h3>
                          <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${fuelBadgeClass(tank.fuelType)}`}>
                            {tank.fuelType}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`text-2xl font-bold ${tank.reorderAlert ? 'text-red-600' : 'text-gray-900'}`}>
                            {p}%
                          </span>
                          {tank.reorderAlert && (
                            <p className="text-xs text-red-500 font-semibold">⚠️ Low</p>
                          )}
                        </div>
                      </div>

                      {/* Bar */}
                      <div className="w-full bg-gray-100 rounded-full h-4 mb-4">
                        <div className={`${bc} h-4 rounded-full transition-all`} style={{ width: `${p}%` }} />
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-gray-400 text-xs">Current</p>
                          <p className="font-bold text-gray-800">{tank.currentLevel.toLocaleString()} L</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-gray-400 text-xs">Capacity</p>
                          <p className="font-bold text-gray-800">{tank.capacity.toLocaleString()} L</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-gray-400 text-xs">Min Level</p>
                          <p className="font-bold text-gray-800">{tank.minLevel.toLocaleString()} L</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-gray-400 text-xs">Last Refill</p>
                          <p className={`font-bold ${d === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                            {d === 0 ? 'Today ✅' : `${d}d ago`}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        {tank.reorderAlert && (
                          <button onClick={() => handleQuickOrder(tank)}
                            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                            🛒 Order
                          </button>
                        )}
                        <button onClick={() => openEditModal(tank)}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold py-2 rounded-lg transition-colors">
                          ✏️ Edit
                        </button>
                        <button onClick={() => handleDeleteTank(tank.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showAddModal && (
        <TankFormModal
          title="Add New Tank"
          onSubmit={handleAddTank}
          onClose={() => { setShowAddModal(false); resetForm(); }}
        />
      )}
      {editingTank && (
        <TankFormModal
          title="Edit Tank"
          onSubmit={handleUpdateTank}
          onClose={() => { setEditingTank(null); resetForm(); }}
        />
      )}
      {showReorderModal && <ReorderAllModal />}
    </div>
  );
}
