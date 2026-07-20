'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiDevice, type ApiFuelSensor } from '@/src/lib/api';

type DeviceTab = 'gps' | 'sensors';

export default function DeviceInventoryPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [tab, setTab]           = useState<DeviceTab>('gps');
  const [devices, setDevices]   = useState<ApiDevice[]>([]);
  const [sensors, setSensors]   = useState<ApiFuelSensor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // GPS device form
  const [devForm, setDevForm] = useState({ imei: '', model: 'Galileosky 7x', sim_phone: '', notes: '' });
  const [devCreating, setDevCreating] = useState(false);
  const [showDevForm, setShowDevForm] = useState(false);

  // Sensor form
  const [senForm, setSenForm] = useState({ serial_no: '', model: 'DUT-E', notes: '' });
  const [senCreating, setSenCreating] = useState(false);
  const [showSenForm, setShowSenForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [devs, sens] = await Promise.all([
        api.admin.listDevices(statusFilter || undefined),
        api.admin.listSensors(statusFilter || undefined),
      ]);
      setDevices(devs);
      setSensors(sens);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  async function handleCreateDevice(e: React.FormEvent) {
    e.preventDefault();
    setDevCreating(true);
    try {
      await api.admin.createDevice({ imei: devForm.imei, model: devForm.model, sim_phone: devForm.sim_phone || undefined, notes: devForm.notes || undefined });
      setDevForm({ imei: '', model: 'Galileosky 7x', sim_phone: '', notes: '' });
      setShowDevForm(false);
      await load();
    } catch (e: any) { setError(e.message ?? 'Failed'); }
    finally { setDevCreating(false); }
  }

  async function handleCreateSensor(e: React.FormEvent) {
    e.preventDefault();
    setSenCreating(true);
    try {
      await api.admin.createSensor({ serial_no: senForm.serial_no, model: senForm.model, notes: senForm.notes || undefined });
      setSenForm({ serial_no: '', model: 'DUT-E', notes: '' });
      setShowSenForm(false);
      await load();
    } catch (e: any) { setError(e.message ?? 'Failed'); }
    finally { setSenCreating(false); }
  }

  async function handleUnassignDevice(deviceId: string) {
    try {
      await api.admin.unassignDevice(deviceId);
      await load();
    } catch (e: any) { setError(e.message ?? 'Unassign failed'); }
  }

  async function handleUnassignSensor(sensorId: string) {
    try {
      await api.admin.unassignSensor(sensorId);
      await load();
    } catch (e: any) { setError(e.message ?? 'Unassign failed'); }
  }

  if (!user) return null;

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = {
      AVAILABLE:   'bg-green-100 text-green-700',
      ASSIGNED:    'bg-blue-100 text-blue-700',
      MAINTENANCE: 'bg-yellow-100 text-yellow-700',
      RETIRED:     'bg-gray-100 text-gray-500',
    };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls[s] ?? 'bg-gray-100 text-gray-500'}`}>{s}</span>;
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Device Inventory" user={user} />
        <main className="flex-1 overflow-y-auto p-6">

          {/* Tab + filter bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              {(['gps', 'sensors'] as DeviceTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t === 'gps' ? '📡 GPS Devices' : '⛽ Fuel Sensors'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setLoading(true); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="RETIRED">Retired</option>
              </select>
              <button
                onClick={() => tab === 'gps' ? setShowDevForm(v => !v) : setShowSenForm(v => !v)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                + Add {tab === 'gps' ? 'Device' : 'Sensor'}
              </button>
            </div>
          </div>

          {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

          {/* Create forms */}
          {tab === 'gps' && showDevForm && (
            <form onSubmit={handleCreateDevice} className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm max-w-lg space-y-4">
              <h3 className="font-semibold text-gray-800">New GPS Device</h3>
              <div className="grid grid-cols-2 gap-4">
                <FieldInline label="IMEI *" value={devForm.imei} onChange={e => setDevForm(f => ({ ...f, imei: e.target.value }))} required />
                <FieldInline label="Model" value={devForm.model} onChange={e => setDevForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <FieldInline label="SIM Phone" value={devForm.sim_phone} onChange={e => setDevForm(f => ({ ...f, sim_phone: e.target.value }))} />
              <FieldInline label="Notes" value={devForm.notes} onChange={e => setDevForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-3">
                <button type="submit" disabled={devCreating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {devCreating ? 'Adding…' : 'Add Device'}
                </button>
                <button type="button" onClick={() => setShowDevForm(false)}
                  className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition">Cancel</button>
              </div>
            </form>
          )}

          {tab === 'sensors' && showSenForm && (
            <form onSubmit={handleCreateSensor} className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm max-w-lg space-y-4">
              <h3 className="font-semibold text-gray-800">New Fuel Sensor</h3>
              <div className="grid grid-cols-2 gap-4">
                <FieldInline label="Serial No. *" value={senForm.serial_no} onChange={e => setSenForm(f => ({ ...f, serial_no: e.target.value }))} required />
                <FieldInline label="Model" value={senForm.model} onChange={e => setSenForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <FieldInline label="Notes" value={senForm.notes} onChange={e => setSenForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-3">
                <button type="submit" disabled={senCreating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                  {senCreating ? 'Adding…' : 'Add Sensor'}
                </button>
                <button type="button" onClick={() => setShowSenForm(false)}
                  className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition">Cancel</button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-gray-400">Loading…</p>
          ) : tab === 'gps' ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {devices.length === 0 ? (
                <p className="text-center py-12 text-gray-400 text-sm">No GPS devices in inventory</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">IMEI</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Model</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">SIM</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-700">{d.imei}</td>
                        <td className="px-4 py-2 text-gray-700">{d.model}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{d.sim_phone ?? '—'}</td>
                        <td className="px-4 py-2">{statusBadge(d.status)}</td>
                        <td className="px-4 py-2 text-right">
                          {d.status === 'ASSIGNED' && (
                            <button
                              onClick={() => handleUnassignDevice(d.id)}
                              className="text-xs text-orange-500 hover:text-orange-700 transition font-medium"
                            >
                              Unassign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {sensors.length === 0 ? (
                <p className="text-center py-12 text-gray-400 text-sm">No fuel sensors in inventory</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Serial No.</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Model</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sensors.map(s => (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-700">{s.serial_no}</td>
                        <td className="px-4 py-2 text-gray-700">{s.model}</td>
                        <td className="px-4 py-2">{statusBadge(s.status)}</td>
                        <td className="px-4 py-2 text-right">
                          {s.status === 'ASSIGNED' && (
                            <button
                              onClick={() => handleUnassignSensor(s.id)}
                              className="text-xs text-orange-500 hover:text-orange-700 transition font-medium"
                            >
                              Unassign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FieldInline({ label, value, onChange, required }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={onChange}
        required={required}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
