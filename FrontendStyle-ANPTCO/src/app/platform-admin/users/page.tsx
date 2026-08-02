'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api } from '@/src/lib/api';

const ROLES = ['SELLER_MANAGER', 'TRANSPORT_ADMIN', 'CLIENT', 'DRIVER'] as const;
type InviteRole = (typeof ROLES)[number];

const ROLE_LABELS: Record<InviteRole, string> = {
  SELLER_MANAGER:  'Seller Manager',
  TRANSPORT_ADMIN: 'Transport Admin',
  CLIENT:          'Client',
  DRIVER:          'Driver',
};

const ROLE_WS_TYPE: Partial<Record<InviteRole, string>> = {
  SELLER_MANAGER:  'SELLER',
  TRANSPORT_ADMIN: 'TSP',
  CLIENT:          'CLIENT',
};

const ROLE_NEEDS_WS = new Set<InviteRole>(['SELLER_MANAGER', 'TRANSPORT_ADMIN', 'CLIENT']);

export default function InviteUserPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const [email,         setEmail]         = useState('');
  const [role,          setRole]          = useState<InviteRole>('SELLER_MANAGER');
  const [wsMode,        setWsMode]        = useState<'new' | 'existing'>('new');
  const [wsName,        setWsName]        = useState('');
  const [wsId,          setWsId]          = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [success,       setSuccess]       = useState<{ email: string; workspace_id: string } | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => { if (!user) router.replace('/auth/login'); }, [router, user]);
  if (!user) return null;

  const needsWs   = ROLE_NEEDS_WS.has(role);
  const wsType    = ROLE_WS_TYPE[role] ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (needsWs && wsMode === 'new' && !wsName.trim()) {
      setError('Workspace name is required when creating a new workspace.');
      return;
    }
    if (needsWs && wsMode === 'existing' && !wsId.trim()) {
      setError('Workspace ID is required when adding to an existing workspace.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Parameters<typeof api.admin.inviteUser>[0] = { email: email.trim(), role };
      if (needsWs) {
        if (wsMode === 'new') {
          body.workspace_name = wsName.trim();
          body.workspace_type = wsType;
        } else {
          body.workspace_id = wsId.trim();
        }
      }
      const res = await api.admin.inviteUser(body);
      setSuccess({ email: res.email ?? email.trim(), workspace_id: res.workspace_id });
      setEmail('');
      setRole('SELLER_MANAGER');
      setWsMode('new');
      setWsName('');
      setWsId('');
    } catch (e: any) {
      setError(e.message ?? 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Invite User" user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-lg space-y-6">

            {/* Info box */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-sm text-purple-800 space-y-1">
              <p className="font-semibold">How invitations work</p>
              <ul className="text-xs text-purple-700 space-y-0.5 list-disc list-inside">
                <li>An email is sent to the user with a temporary password.</li>
                <li>They log in and are forced to set a new password on first use.</li>
                <li>For Seller / Transport roles, a workspace is created automatically.</li>
              </ul>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="user@example.com"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-sm"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setRole(r); setWsMode('new'); setWsName(''); setWsId(''); }}
                      className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left ${
                        role === r
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Workspace section — only for roles that need one */}
              {needsWs && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="block text-sm font-semibold text-gray-700">Workspace</label>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                      {(['new', 'existing'] as const).map(m => (
                        <button key={m} type="button"
                          onClick={() => setWsMode(m)}
                          className={`px-3 py-1 font-medium transition-colors ${
                            wsMode === m ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {m === 'new' ? 'Create new' : 'Existing'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {wsMode === 'new' ? (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Workspace name <span className="text-gray-400">(type: {wsType})</span>
                      </label>
                      <input
                        type="text"
                        value={wsName}
                        onChange={e => setWsName(e.target.value)}
                        placeholder={role === 'SELLER_MANAGER' ? 'e.g. OMMCO Fuel Ltd' : role === 'TRANSPORT_ADMIN' ? 'e.g. Gulf Logistics LLC' : 'e.g. Acme Corp'}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-sm"
                      />
                      <p className="text-xs text-gray-400 mt-1">A new workspace will be created with this name.</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Existing workspace UUID</label>
                      <input
                        type="text"
                        value={wsId}
                        onChange={e => setWsId(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-sm font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">The user will be added to this existing workspace.</p>
                    </div>
                  )}
                </div>
              )}

              {error   && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

              {success && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-1">
                  <p className="text-sm font-semibold text-emerald-700">Invitation sent to {success.email}</p>
                  <p className="text-xs text-emerald-600 font-mono">Workspace: {success.workspace_id}</p>
                  <p className="text-xs text-emerald-500">User will receive a temporary password by email.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {submitting ? 'Sending invitation…' : 'Send Invitation'}
              </button>
            </form>

            {/* Step-by-step guide */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 text-sm">
              <h3 className="font-semibold text-gray-800">How to create a Seller account</h3>
              <ol className="space-y-2 text-gray-600 text-xs list-decimal list-inside">
                <li>Select role <strong>Seller Manager</strong> and choose <strong>Create new</strong> workspace.</li>
                <li>Enter the company name as workspace name (e.g. "OMMCO Fuel Ltd").</li>
                <li>Enter the seller's email and click <strong>Send Invitation</strong>.</li>
                <li>Note the workspace ID shown in the success box — share it with the seller so they can enter their seller code in connections.</li>
                <li>Seller logs in, sets a new password, and starts receiving orders.</li>
              </ol>

              <h3 className="font-semibold text-gray-800 pt-2">How to create a Transport Admin account</h3>
              <ol className="space-y-2 text-gray-600 text-xs list-decimal list-inside">
                <li>Select role <strong>Transport Admin</strong> and choose <strong>Create new</strong> workspace.</li>
                <li>Enter the fleet company name as workspace name (e.g. "Gulf Logistics LLC").</li>
                <li>Enter the transporter's email and click <strong>Send Invitation</strong>.</li>
                <li>Transport Admin logs in, sets a new password, and can request seller connections using the seller's code.</li>
              </ol>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
