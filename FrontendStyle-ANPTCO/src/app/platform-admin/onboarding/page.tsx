'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api, type ApiAdminWorkspace } from '@/src/lib/api';

export default function OnboardingPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [workspaces, setWorkspaces] = useState<ApiAdminWorkspace[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [creating, setCreating]     = useState(false);

  // New workspace form state
  const [form, setForm] = useState({ slug: '', name: '', type: 'TSP', is_sandbox: false });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const ws = await api.admin.listWorkspaces();
      setWorkspaces(ws);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.slug || !form.name) return;
    setCreating(true);
    try {
      await api.admin.createWorkspace(form);
      setShowForm(false);
      setForm({ slug: '', name: '', type: 'TSP', is_sandbox: false });
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Customer Onboarding" user={user} />
        <main className="flex-1 overflow-y-auto p-6">

          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Workspaces</h2>
              <p className="text-sm text-gray-500">Manage Mode B customers from contract to go-live</p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              + New Workspace
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form onSubmit={handleCreate} className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4 max-w-lg">
              <h3 className="font-semibold text-gray-800">New Workspace</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
                  <input
                    value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="ws-company-name"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Acme Logistics"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TSP">TSP (Fleet Operator)</option>
                    <option value="SELLER">Seller</option>
                    <option value="CLIENT">Client</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    id="sandbox"
                    checked={form.is_sandbox}
                    onChange={e => setForm(f => ({ ...f, is_sandbox: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="sandbox" className="text-sm text-gray-600">Sandbox / Test</label>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {creating ? 'Creating…' : 'Create Workspace'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}

          {loading ? (
            <p className="text-slate-500">Loading…</p>
          ) : (
            <div className="grid gap-3">
              {workspaces.map(ws => (
                <div
                  key={ws.id}
                  onClick={() => router.push(`/platform-admin/onboarding/${ws.id}`)}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-blue-400 hover:shadow-md cursor-pointer transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-lg">
                        {ws.type === 'TSP' ? '🚛' : ws.type === 'SELLER' ? '🏭' : '🏢'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{ws.name}</span>
                          {ws.is_sandbox && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Sandbox</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{ws.slug} · {ws.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ModulePills modules={ws.modules} />
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-3">🚀</p>
                  <p className="font-medium">No workspaces yet</p>
                  <p className="text-sm">Create the first one above</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ModulePills({ modules }: { modules: Record<string, boolean> | null }) {
  if (!modules) return null;
  const active = Object.entries(modules).filter(([, v]) => v).map(([k]) => k);
  return (
    <div className="flex gap-1">
      {active.map(k => (
        <span key={k} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{k}</span>
      ))}
    </div>
  );
}
