'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import {
  api,
  type ApiAdminWorkspace,
  type ApiWorkspaceProfile,
  type ApiWorkspaceSubscription,
  type ApiSubscriptionPlan,
  type ApiReadinessReport,
  type ApiDispatchAPIKey,
  type ApiDriver,
  type ApiIntegration,
  type ApiAdminTruck,
  type ApiTruckCompartment,
  type ApiTrip,
  type ApiAssetEvent,
} from '@/src/lib/api';

type Tab = 'overview' | 'profile' | 'modules' | 'fleet' | 'drivers' | 'api-keys' | 'erp' | 'trips' | 'events' | 'audit';

export default function WorkspaceOnboardingDetail() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const user    = getCurrentUser();

  const [tab, setTab]                   = useState<Tab>('overview');
  const [workspace, setWorkspace]       = useState<ApiAdminWorkspace | null>(null);
  const [profile, setProfile]           = useState<ApiWorkspaceProfile | null>(null);
  const [subscription, setSubscription] = useState<ApiWorkspaceSubscription | null>(null);
  const [readiness, setReadiness]       = useState<ApiReadinessReport | null>(null);
  const [plans, setPlans]               = useState<ApiSubscriptionPlan[]>([]);
  const [apiKeys, setApiKeys]           = useState<ApiDispatchAPIKey[]>([]);
  const [drivers, setDrivers]           = useState<ApiDriver[]>([]);
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [newKeyValue, setNewKeyValue]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, plansRes, keysRes, driversRes, intRes, readinessRes] = await Promise.all([
        api.admin.getWorkspace(id),
        api.admin.listPlans(),
        api.admin.listAPIKeys(id),
        api.admin.listDrivers(id),
        api.admin.listIntegrations(id),
        api.admin.getReadiness(id),
      ]);
      setWorkspace(detail.workspace);
      setProfile(detail.profile);
      setSubscription(detail.subscription);
      setPlans(plansRes);
      setApiKeys(keysRes);
      setDrivers(driversRes);
      setIntegrations(intRes);
      setReadiness(readinessRes);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    load();
  }, [load, router, user]);

  if (!user || loading) return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400">{loading ? 'Loading…' : ''}</p>
      </div>
    </div>
  );

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview',  label: 'Overview',   icon: '📊' },
    { key: 'profile',   label: 'Profile',    icon: '🏢' },
    { key: 'modules',   label: 'Modules',    icon: '🧩' },
    { key: 'fleet',     label: 'Fleet',      icon: '🚛' },
    { key: 'drivers',   label: 'Drivers',    icon: '👤' },
    { key: 'api-keys',  label: 'API Keys',   icon: '🔑' },
    { key: 'erp',       label: 'ERP',        icon: '🔗' },
    { key: 'trips',     label: 'Trips',      icon: '📍' },
    { key: 'events',    label: 'Events',     icon: '⚡' },
    { key: 'audit',     label: 'Audit Log',  icon: '📋' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={workspace?.name ?? 'Workspace'} user={user} />
        <main className="flex-1 overflow-y-auto">

          {/* Workspace header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-gray-900">{workspace?.name}</span>
                  {workspace?.is_sandbox && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Sandbox</span>
                  )}
                  {readiness?.ready && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Go-live Ready</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{workspace?.slug} · {workspace?.type}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    tab === t.key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-600 p-6 text-sm">{error}</p>}

          <div className="p-6">
            {tab === 'overview' && (
              <OverviewTab readiness={readiness} subscription={subscription} plans={plans} />
            )}
            {tab === 'profile' && (
              <ProfileTab
                id={id} profile={profile} saving={saving}
                onSave={async (p) => {
                  setSaving(true);
                  try {
                    const updated = await api.admin.upsertProfile(id, p);
                    setProfile(updated);
                  } catch (e: any) { setError(e.message); }
                  finally { setSaving(false); }
                }}
              />
            )}
            {tab === 'modules' && workspace && (
              <ModulesTab
                modules={workspace.modules as Record<string, boolean>}
                saving={saving}
                onSave={async (m) => {
                  setSaving(true);
                  try {
                    await api.admin.setModules(id, m);
                    setWorkspace(w => w ? { ...w, modules: m as any } : w);
                  } catch (e: any) { setError(e.message); }
                  finally { setSaving(false); }
                }}
              />
            )}
            {tab === 'fleet' && (
              <FleetTab wsId={id} onError={setError} />
            )}
            {tab === 'drivers' && (
              <DriversTab wsId={id} drivers={drivers} onRefresh={load} onError={setError} />
            )}
            {tab === 'api-keys' && (
              <APIKeysTab
                wsId={id} keys={apiKeys} newKeyValue={newKeyValue}
                onClearNewKey={() => setNewKeyValue(null)}
                onRefresh={load}
                onError={setError}
                onNewKey={setNewKeyValue}
              />
            )}
            {tab === 'erp' && (
              <ERPTab wsId={id} integrations={integrations} saving={saving} onRefresh={load} onError={setError} setSaving={setSaving} />
            )}
            {tab === 'trips' && (
              <TripsTab wsId={id} />
            )}
            {tab === 'events' && (
              <EventsTab wsId={id} />
            )}
            {tab === 'audit' && (
              <AuditTab wsId={id} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ readiness, subscription, plans }: {
  readiness: ApiReadinessReport | null;
  subscription: ApiWorkspaceSubscription | null;
  plans: ApiSubscriptionPlan[];
}) {
  const plan = plans.find(p => p.id === subscription?.plan_id);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Readiness checklist */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4">Go-Live Readiness</h3>
        {readiness ? (
          <div className="space-y-2">
            {readiness.checks.map(c => (
              <div key={c.key} className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  c.passed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {c.passed ? '✓' : '○'}
                </span>
                <span className={`text-sm ${c.passed ? 'text-gray-800' : 'text-gray-400'}`}>{c.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Loading…</p>
        )}
      </div>

      {/* Subscription */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">Subscription</h3>
        {subscription && plan ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-600">{plan.name}</span>
            <span className="text-sm text-gray-500">${plan.price_usd}/mo · {plan.max_trucks === 0 ? 'Unlimited' : plan.max_trucks} trucks</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{subscription.status}</span>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No active subscription</p>
        )}
      </div>
    </div>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileTab({ id: _id, profile, saving, onSave }: {
  id: string;
  profile: ApiWorkspaceProfile | null;
  saving: boolean;
  onSave: (p: Partial<ApiWorkspaceProfile>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<ApiWorkspaceProfile>>(profile ?? {});
  const f = (k: keyof ApiWorkspaceProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="max-w-lg space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Company Profile</h3>
        <Field label="Company Name" value={form.company_name ?? ''} onChange={f('company_name')} required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Reg. No." value={form.company_reg_no ?? ''} onChange={f('company_reg_no')} />
          <Field label="Tax ID" value={form.tax_id ?? ''} onChange={f('tax_id')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Country (ISO 2)" value={form.country ?? 'AZ'} onChange={f('country')} />
          <Field label="City" value={form.city ?? ''} onChange={f('city')} />
        </div>
        <Field label="Address" value={form.address ?? ''} onChange={f('address')} textarea />
        <h3 className="font-semibold text-gray-900 pt-2">Contact</h3>
        <Field label="Contact Name" value={form.contact_name ?? ''} onChange={f('contact_name')} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={form.contact_email ?? ''} onChange={f('contact_email')} type="email" />
          <Field label="Phone" value={form.contact_phone ?? ''} onChange={f('contact_phone')} />
        </div>
        <Field label="Notes" value={form.notes ?? ''} onChange={f('notes')} textarea />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {saving ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  );
}

// ── Modules ───────────────────────────────────────────────────────────────────

const MODULE_LIST = [
  { key: 'ordering',    label: 'Mode A — Order Workflow',  description: 'Seller-driven orders, truck assignment, loading lifecycle' },
  { key: 'dispatch_api', label: 'Mode B — Dispatch API',  description: 'Machine-to-machine dispatch via REST API key' },
  { key: 'monitoring',  label: 'Live Monitoring',          description: 'GPS fleet tracking and geofence events' },
  { key: 'sandbox',     label: 'Sandbox Mode',             description: 'Excluded from billing; for integration testing' },
];

function ModulesTab({ modules, saving, onSave }: {
  modules: Record<string, boolean>;
  saving: boolean;
  onSave: (m: Record<string, boolean>) => Promise<void>;
}) {
  const [local, setLocal] = useState<Record<string, boolean>>(modules ?? {});

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="font-semibold text-gray-900">Module Configuration</h3>
        {MODULE_LIST.map(m => (
          <div key={m.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-900">{m.label}</p>
              <p className="text-xs text-gray-400">{m.description}</p>
            </div>
            <button
              onClick={() => setLocal(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
              className={`relative inline-flex w-10 h-6 rounded-full transition-colors ${
                local[m.key] ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                local[m.key] ? 'translate-x-5' : 'translate-x-1'
              }`} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSave(local)}
        disabled={saving}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {saving ? 'Saving…' : 'Save Modules'}
      </button>
    </div>
  );
}

// ── Fleet ─────────────────────────────────────────────────────────────────────

function FleetTab({ wsId, onError }: { wsId: string; onError: (e: string) => void }) {
  const [trucks, setTrucks]     = useState<ApiAdminTruck[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ device_imei: '', license_plate: '', make: '', model: '', year: '' });

  const loadTrucks = useCallback(async () => {
    try {
      const list = await api.admin.listTrucks(wsId);
      setTrucks(list ?? []);
    } catch (e: any) {
      onError(e.message ?? 'Failed to load trucks');
    } finally {
      setLoading(false);
    }
  }, [wsId, onError]);

  useEffect(() => { loadTrucks(); }, [loadTrucks]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.admin.createTruck(wsId, {
        device_imei:   form.device_imei || `MANUAL-${Date.now()}`,
        license_plate: form.license_plate || undefined,
        make:          form.make || undefined,
        model:         form.model || undefined,
        year:          form.year ? parseInt(form.year) : undefined,
      });
      setForm({ device_imei: '', license_plate: '', make: '', model: '', year: '' });
      await loadTrucks();
    } catch (e: any) {
      onError(e.message ?? 'Failed to create truck');
    } finally {
      setCreating(false);
    }
  }

  const truckLabel = (t: ApiAdminTruck) =>
    [t.license_plate, t.make, t.model, t.year].filter(Boolean).join(' · ') || t.id.slice(0, 8);

  if (loading) return <p className="text-sm text-gray-400">Loading fleet…</p>;

  return (
    <div className="max-w-2xl space-y-4">

      {/* Existing trucks */}
      {trucks.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Registered Trucks ({trucks.length})</h3>
          {trucks.map(t => (
            <TruckCard
              key={t.id}
              truck={t}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId(v => v === t.id ? null : t.id)}
              onCompartmentsUpdated={loadTrucks}
              onError={onError}
            />
          ))}
        </div>
      )}

      {/* Register new truck */}
      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Register New Truck</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="License Plate *" value={form.license_plate} onChange={e => setForm(f => ({ ...f, license_plate: e.target.value }))} required />
          <Field label="Make" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} placeholder="Volvo" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="FH16 540" />
          <Field label="Year" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2022" />
        </div>
        <Field label="GPS Device IMEI (optional)" value={form.device_imei} onChange={e => setForm(f => ({ ...f, device_imei: e.target.value }))} placeholder="Leave blank to assign later" />
        <button
          type="submit"
          disabled={creating || !form.license_plate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {creating ? 'Registering…' : 'Register Truck'}
        </button>
      </form>
    </div>
  );
}

function TruckCard({
  truck, expanded, onToggle, onCompartmentsUpdated, onError,
}: {
  truck: ApiAdminTruck;
  expanded: boolean;
  onToggle: () => void;
  onCompartmentsUpdated: () => void;
  onError: (e: string) => void;
}) {
  const [compartments, setCompartments] = useState<ApiTruckCompartment[]>(truck.compartments ?? []);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Array<{ compartment_no: number; capacity_liters: number; product_type: string }>>(
    truck.compartments?.length
      ? truck.compartments.map(c => ({ compartment_no: c.compartment_no, capacity_liters: c.capacity_liters, product_type: c.product_type }))
      : [{ compartment_no: 1, capacity_liters: 0, product_type: 'DIESEL' }]
  );

  async function handleSaveCompartments() {
    setSaving(true);
    try {
      const saved = await api.admin.upsertCompartments(truck.id, draft.filter(d => d.capacity_liters > 0));
      setCompartments(saved);
      onCompartmentsUpdated();
    } catch (e: any) {
      onError(e.message ?? 'Failed to save compartments');
    } finally {
      setSaving(false);
    }
  }

  const label = [truck.license_plate, truck.make, truck.model].filter(Boolean).join(' — ') || truck.id.slice(0, 8);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🚛</span>
          <div>
            <div className="font-semibold text-sm text-gray-900">{label}</div>
            <div className="text-xs text-gray-400">
              {compartments.length > 0
                ? `${compartments.length} compartment${compartments.length > 1 ? 's' : ''} · ${compartments.reduce((s, c) => s + c.capacity_liters, 0).toLocaleString()}L total`
                : 'No compartments — click to add'}
            </div>
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compartments</div>

          {draft.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 block mb-0.5">No.</label>
                <input
                  type="number" min={1}
                  value={c.compartment_no}
                  onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, compartment_no: parseInt(e.target.value) || 1 } : x))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-4">
                <label className="text-xs text-gray-400 block mb-0.5">Capacity (L)</label>
                <input
                  type="number" min={1}
                  value={c.capacity_liters || ''}
                  onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, capacity_liters: parseInt(e.target.value) || 0 } : x))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-4">
                <label className="text-xs text-gray-400 block mb-0.5">Product</label>
                <select
                  value={c.product_type}
                  onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, product_type: e.target.value } : x))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DIESEL">Diesel</option>
                  <option value="PETROL">Petrol</option>
                  <option value="FUEL">Fuel</option>
                  <option value="JET_A1">Jet A-1</option>
                </select>
              </div>
              <div className="col-span-2 flex items-end pb-0.5">
                <button
                  type="button"
                  onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 transition p-1.5"
                >✕</button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDraft(d => [...d, { compartment_no: d.length + 1, capacity_liters: 0, product_type: 'DIESEL' }])}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
            >
              + Add compartment
            </button>
            <button
              type="button"
              onClick={handleSaveCompartments}
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save compartments'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Drivers ───────────────────────────────────────────────────────────────────

function DriversTab({ wsId, drivers, onRefresh, onError }: {
  wsId: string;
  drivers: ApiDriver[];
  onRefresh: () => void;
  onError: (e: string) => void;
}) {
  const [form, setForm] = useState({ full_name: '', phone: '', license_no: '' });
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name) return;
    setCreating(true);
    try {
      await api.admin.createDriver(wsId, { full_name: form.full_name, phone: form.phone || undefined, license_no: form.license_no || undefined });
      setForm({ full_name: '', phone: '', license_no: '' });
      onRefresh();
    } catch (e: any) {
      onError(e.message ?? 'Failed to create driver');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">Add Driver</h3>
        <Field label="Full Name *" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Field label="License No." value={form.license_no} onChange={e => setForm(f => ({ ...f, license_no: e.target.value }))} />
        </div>
        <button type="submit" disabled={creating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
          {creating ? 'Adding…' : 'Add Driver'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {drivers.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No drivers registered yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Phone</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">License</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{d.full_name}</td>
                  <td className="px-4 py-2 text-gray-500">{d.phone ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{d.license_no ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── API Keys ──────────────────────────────────────────────────────────────────

function APIKeysTab({ wsId, keys, newKeyValue, onClearNewKey, onRefresh, onError, onNewKey }: {
  wsId: string;
  keys: ApiDispatchAPIKey[];
  newKeyValue: string | null;
  onClearNewKey: () => void;
  onRefresh: () => void;
  onError: (e: string) => void;
  onNewKey: (v: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.admin.createAPIKey(wsId, description || undefined);
      if (res.key) onNewKey(res.key);
      setDescription('');
      onRefresh();
    } catch (e: any) {
      onError(e.message ?? 'Failed to create key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await api.admin.revokeAPIKey(keyId);
      onRefresh();
    } catch (e: any) {
      onError(e.message ?? 'Failed to revoke key');
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* New key reveal */}
      {newKeyValue && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-yellow-800 mb-1">New API Key — copy now, it won&apos;t be shown again</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-yellow-100 text-yellow-900 px-3 py-2 rounded-lg flex-1 break-all font-mono">{newKeyValue}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(newKeyValue); }}
              className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-xs font-medium hover:bg-yellow-700 transition"
            >
              Copy
            </button>
            <button onClick={onClearNewKey} className="px-3 py-2 text-yellow-700 hover:bg-yellow-100 rounded-lg text-xs transition">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create new key */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">Create API Key</h3>
        <div className="flex gap-3">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (e.g. Production ERP)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || keys.filter(k => k.status === 'ACTIVE').length >= 2}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {creating ? 'Creating…' : 'Create Key'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Maximum 2 active keys. Create a second before revoking the first to rotate with zero downtime.</p>
      </div>

      {/* Key list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {keys.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No API keys yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Description</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Created</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Last Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-900">{k.description ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      k.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{k.status}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-2">
                    {k.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition font-medium"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── ERP Integration ───────────────────────────────────────────────────────────

function ERPTab({ wsId, integrations, saving, onRefresh, onError, setSaving }: {
  wsId: string;
  integrations: ApiIntegration[];
  saving: boolean;
  onRefresh: () => void;
  onError: (e: string) => void;
  setSaving: (v: boolean) => void;
}) {
  const [form, setForm] = useState<Partial<ApiIntegration>>({ system_type: 'REST_WEBHOOK', auth_type: 'API_KEY', status: 'PENDING' });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.admin.upsertIntegration(wsId, form);
      onRefresh();
    } catch (e: any) {
      onError(e.message ?? 'Failed to save integration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">ERP Integration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">System Type</label>
            <select
              value={form.system_type ?? 'REST_WEBHOOK'}
              onChange={e => setForm(f => ({ ...f, system_type: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="REST_WEBHOOK">REST / Webhook</option>
              <option value="SAP">SAP</option>
              <option value="1C">1C</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Auth Type</label>
            <select
              value={form.auth_type ?? 'API_KEY'}
              onChange={e => setForm(f => ({ ...f, auth_type: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="API_KEY">API Key</option>
              <option value="BASIC">Basic Auth</option>
              <option value="OAUTH2">OAuth 2.0</option>
              <option value="NONE">None</option>
            </select>
          </div>
        </div>
        <Field label="Base URL" value={form.base_url ?? ''} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} />
        <Field label="Notes" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} textarea />
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
          {saving ? 'Saving…' : 'Save Integration'}
        </button>
      </form>

      {integrations.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Configured Integrations</h3>
          {integrations.map(i => (
            <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-900">{i.system_type}</p>
                <p className="text-xs text-gray-400">{i.base_url ?? 'No URL'} · {i.auth_type}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                i.status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                i.status === 'FAILED'   ? 'bg-red-100 text-red-600' :
                'bg-gray-100 text-gray-500'
              }`}>{i.status}</span>
            </div>
          ))}
        </div>
      )}

      <ClientPortalInvite wsId={wsId} />
    </div>
  );
}

function ClientPortalInvite({ wsId }: { wsId: string }) {
  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg]   = useState('');

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrMsg('');
    try {
      await api.admin.inviteClientUser(wsId, email.trim());
      setStatus('sent');
      setEmail('');
    } catch (err: any) {
      setErrMsg(err.message ?? 'Failed to invite user');
      setStatus('error');
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Client Portal Access</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Invite staff from this company to log in to the client portal. They will receive a
          temporary password by email and see only the modules this workspace has enabled.
        </p>
      </div>
      <form onSubmit={handleInvite} className="flex gap-2">
        <input
          type="email"
          placeholder="user@company.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setStatus('idle'); }}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          disabled={status === 'sending' || !email.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {status === 'sending' ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      {status === 'sent'  && <p className="text-xs text-green-600">Invitation sent. The user will receive a temporary password by email.</p>}
      {status === 'error' && <p className="text-xs text-red-500">{errMsg}</p>}
    </div>
  );
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

function AuditTab({ wsId }: { wsId: string }) {
  const [entries, setEntries] = useState<import('@/src/lib/api').ApiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.getAuditLog(wsId)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wsId]);

  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>;

  return (
    <div className="max-w-2xl bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {entries.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">No audit entries</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Action</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Actor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{e.action}</td>
                <td className="px-4 py-2 text-xs text-gray-400 font-mono truncate max-w-[140px]">{e.actor_id}</td>
                <td className="px-4 py-2 text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Events ────────────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; color: string; unit: string }> = {
  FUEL_FILL:      { label: 'Fuel Fill',       color: 'bg-green-100 text-green-800',   unit: 'L' },
  FUEL_DRAIN:     { label: 'Fuel Drain',      color: 'bg-orange-100 text-orange-800', unit: 'L' },
  BATTERY_ON:     { label: 'Battery ON',      color: 'bg-blue-100 text-blue-800',     unit: 'V' },
  BATTERY_OFF:    { label: 'Battery OFF',     color: 'bg-red-100 text-red-700',       unit: 'V' },
  IGNITION_ON:    { label: 'Ignition ON',     color: 'bg-teal-100 text-teal-800',     unit: '' },
  IGNITION_OFF:   { label: 'Ignition OFF',    color: 'bg-gray-100 text-gray-600',     unit: '' },
  MOVEMENT_START: { label: 'Movement Start',  color: 'bg-indigo-100 text-indigo-800', unit: 'km/h' },
  MOVEMENT_STOP:  { label: 'Movement Stop',   color: 'bg-purple-100 text-purple-800', unit: 'km/h' },
};

function EventsTab({ wsId }: { wsId: string }) {
  const [events, setEvents]     = useState<ApiAssetEvent[]>([]);
  const [trucks, setTrucks]     = useState<ApiAdminTruck[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<string>('ALL');

  useEffect(() => {
    Promise.all([
      api.admin.listEvents(wsId),
      api.admin.listTrucks(wsId),
    ])
      .then(([evs, tks]) => {
        setEvents(evs ?? []);
        setTrucks(tks ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wsId]);

  const truckLabel = (truckId: string) => {
    const t = trucks.find(t => t.id === truckId);
    return t ? ([t.license_plate, t.make, t.model].filter(Boolean).join(' ') || truckId.slice(0, 8)) : truckId.slice(0, 8);
  };

  const categories = ['ALL', 'FUEL', 'BATTERY', 'IGNITION', 'MOVEMENT'];
  const filtered = filter === 'ALL' ? events : events.filter(e => e.event_type.startsWith(filter));

  if (loading) return <p className="text-sm text-gray-400">Loading events…</p>;

  return (
    <div className="max-w-3xl space-y-4">

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              filter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <p className="text-gray-400 text-sm">No events recorded yet</p>
          <p className="text-gray-300 text-xs mt-1">Events appear as the truck sends telemetry</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-3">
            {filtered.map(e => {
              const meta = EVENT_META[e.event_type] ?? { label: e.event_type, color: 'bg-gray-100 text-gray-600', unit: '' };
              const hasValue = e.value_before != null || e.value_after != null;
              const mapsUrl = e.latitude && e.longitude
                ? `https://www.google.com/maps?q=${e.latitude},${e.longitude}`
                : null;

              return (
                <div key={e.id} className="flex gap-4 relative">
                  {/* Dot */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 text-xs font-bold ${meta.color}`}>
                    {e.event_type === 'FUEL_FILL'      ? '⛽' :
                     e.event_type === 'FUEL_DRAIN'     ? '📉' :
                     e.event_type === 'BATTERY_ON'     ? '🔋' :
                     e.event_type === 'BATTERY_OFF'    ? '🪫' :
                     e.event_type === 'IGNITION_ON'    ? '🔑' :
                     e.event_type === 'IGNITION_OFF'   ? '🔒' :
                     e.event_type === 'MOVEMENT_START' ? '🚛' :
                                                         '🅿️'}
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">{truckLabel(e.truck_id)}</span>
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(e.occurred_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                      {/* Before → After */}
                      {hasValue && (
                        <span className="text-sm font-mono text-gray-700">
                          {e.value_before != null ? `${e.value_before.toFixed(1)}${meta.unit}` : '—'}
                          {' → '}
                          {e.value_after  != null ? `${e.value_after.toFixed(1)}${meta.unit}`  : '—'}
                        </span>
                      )}
                      {/* Delta for fuel */}
                      {(e.event_type === 'FUEL_FILL' || e.event_type === 'FUEL_DRAIN') &&
                       e.value_before != null && e.value_after != null && (
                        <span className={`text-xs font-semibold ${e.event_type === 'FUEL_FILL' ? 'text-green-600' : 'text-orange-600'}`}>
                          {e.event_type === 'FUEL_FILL' ? '+' : ''}{(e.value_after - e.value_before).toFixed(1)}L
                        </span>
                      )}
                      {/* Location */}
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700 underline font-mono"
                        >
                          {e.latitude!.toFixed(4)}, {e.longitude!.toFixed(4)}
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">no location</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Field({ label, value, onChange, required, textarea, type, placeholder }: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean;
  textarea?: boolean;
  type?: string;
  placeholder?: string;
}) {
  const cls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {textarea
        ? <textarea value={value} onChange={onChange} rows={3} className={cls} placeholder={placeholder} />
        : <input type={type ?? 'text'} value={value} onChange={onChange} className={cls} required={required} placeholder={placeholder} />
      }
    </div>
  );
}

// ── Trips ─────────────────────────────────────────────────────────────────────

function TripsTab({ wsId }: { wsId: string }) {
  const [trips, setTrips]   = useState<ApiTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.listTrips(wsId)
      .then(t => setTrips(t ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wsId]);

  if (loading) return <p className="text-sm text-gray-400">Loading trips…</p>;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      LOADING:          'bg-gray-100 text-gray-500',
      LOADED:           'bg-blue-50 text-blue-600',
      EN_ROUTE:         'bg-yellow-100 text-yellow-700',
      ARRIVED:          'bg-orange-100 text-orange-700',
      DELIVERY_ACCEPTED:'bg-indigo-100 text-indigo-700',
      COMPLETED:        'bg-green-100 text-green-700',
    };
    return map[s] ?? 'bg-gray-100 text-gray-500';
  };

  return (
    <div className="max-w-3xl space-y-3">
      {trips.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <p className="text-gray-400 text-sm">No trips yet for this workspace</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">{trips.length} trip{trips.length !== 1 ? 's' : ''} · most recent first</p>
          {trips.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusBadge(t.status)}`}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                    {t.order_ref && (
                      <span className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{t.order_ref}</span>
                    )}
                    <span className="text-xs text-gray-400">{t.source}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1.5 truncate">
                    {t.origin_name ? `${t.origin_name} → ` : ''}{t.dest_name}
                  </p>
                  {t.driver_name && (
                    <p className="text-xs text-gray-400 mt-0.5">Driver: {t.driver_name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-300 mt-0.5">{t.id.slice(0, 8)}…</p>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
