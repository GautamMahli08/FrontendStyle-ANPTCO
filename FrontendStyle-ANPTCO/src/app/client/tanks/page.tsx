'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiGeofence } from '@/src/lib/api';

export default function ClientTanksPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [stations, setStations] = useState<ApiGeofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    api.stations.list()
      .then(setStations)
      .catch(e => setError(e.message ?? 'Failed to load stations'))
      .finally(() => setLoading(false));
  }, [router, user]);

  if (!user) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !lat || !lng) {
      setFormError('Name, latitude and longitude are required');
      return;
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius_meters = parseInt(radius) || 100;
    if (isNaN(latitude) || isNaN(longitude)) {
      setFormError('Latitude and longitude must be valid numbers');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.stations.create({ name: name.trim(), latitude, longitude, radius_meters });
      setStations(prev => [...prev, created]);
      setShowForm(false);
      setName(''); setLat(''); setLng(''); setRadius('100');
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to create station');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="CLIENT" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Fuel Stations" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Your registered delivery stations — select one when placing an order.</p>
              <button
                onClick={() => { setShowForm(true); setFormError(null); }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
              >
                + Add Station
              </button>
            </div>

            {showForm && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">New Fuel Station</h3>
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm mb-4">{formError}</div>
                )}
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Station Name *</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="e.g. Main Fuel Station"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Latitude *</label>
                      <input
                        type="number" step="any" value={lat} onChange={e => setLat(e.target.value)}
                        placeholder="e.g. 19.0760"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Longitude *</label>
                      <input
                        type="number" step="any" value={lng} onChange={e => setLng(e.target.value)}
                        placeholder="e.g. 72.8777"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Geofence Radius (metres)</label>
                    <input
                      type="number" min="50" value={radius} onChange={e => setRadius(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">Minimum 50 m. The truck must enter this radius for ARRIVED status to trigger.</p>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowForm(false)}
                      className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting}
                      className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {submitting ? 'Saving…' : 'Save Station'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading && (
              <div className="text-center py-12 text-slate-400 text-sm">Loading…</div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {!loading && !error && stations.length === 0 && !showForm && (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <div className="text-3xl mb-3">⛽</div>
                <p className="text-slate-600 font-semibold mb-1">No stations yet</p>
                <p className="text-slate-400 text-sm mb-4">Add your fuel station so you can select it when placing an order.</p>
                <button onClick={() => setShowForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                  + Add Station
                </button>
              </div>
            )}

            {stations.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {stations.map(s => (
                  <div key={s.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)} · {s.radius_meters} m radius
                      </p>
                    </div>
                    <span className="text-xs bg-green-50 text-green-700 font-semibold px-2 py-1 rounded-full border border-green-200">ACTIVE</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
