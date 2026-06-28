'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';
import { api } from '@/src/lib/api';

const ROLES = ['CLIENT', 'SELLER_MANAGER', 'TRANSPORT_ADMIN', 'DRIVER'] as const;
type InviteRole = (typeof ROLES)[number];

export default function InviteUserPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('CLIENT');
  const [workspaceId, setWorkspaceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) router.replace('/auth/login');
  }, [router, user]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.inviteUser({
        email,
        role,
        ...(workspaceId.trim() ? { workspace_id: workspaceId.trim() } : {}),
      });
      setSuccess(`Invitation sent to ${email}`);
      setEmail('');
      setRole('CLIENT');
      setWorkspaceId('');
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
          <div className="max-w-lg">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as InviteRole)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workspace ID <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={workspaceId}
                  onChange={e => setWorkspaceId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  placeholder="workspace-uuid"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition"
              >
                {submitting ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
