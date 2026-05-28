'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, addUser, addNotification } from '@/src/lib/demo-data';

export default function InviteTransportPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [companyName, setCompanyName] = useState('');
  const [message,     setMessage]     = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  if (!mounted) return null;
  if (!user)                          { router.push('/'); return null; }
  if (user.role !== 'SELLER_MANAGER') { router.push('/'); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Split name into firstName / lastName to satisfy User type
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] ?? '';
      const lastName  = nameParts.slice(1).join(' ') || '';

      // Create new transport admin user — all required User fields included
      const newTSP = {
        id:          `tsp-${Date.now()}`,
        firstName,
        lastName,
        name,                           // keep for display convenience
        email,
        phone,
        companyName,
        role:        'TRANSPORT_ADMIN' as const,
        workspaceId: user.workspaceId,
        status:      'INVITED',
        verified:    false,             // ← required by User type
        invitedBy:   user.id,
        invitedAt:   new Date(),
      };

      addUser(newTSP);

      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    newTSP.id,
        type:      'TSP_INVITED',
        title:     '🎉 Welcome to the Platform!',
        message:   `You've been invited by ${user.name ?? user.firstName} to join as a Transport Service Provider. Complete your KYC to start accepting orders.`,
        read:      false,
        createdAt: new Date(),
      });

      alert(`✅ Invitation sent to ${name}!`);

      setName('');
      setEmail('');
      setPhone('');
      setCompanyName('');
      setMessage('');

      setTimeout(() => router.push('/seller/dashboard'), 1000);
    } catch (error) {
      console.error('Error inviting TSP:', error);
      alert('❌ Error sending invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Invite Transport Provider 🚛</h1>
            <p className="text-gray-600">Add a new transport service provider to your network</p>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Info Banner */}
            <div className="bg-blue-50 rounded-xl p-6 mb-8 border border-blue-200">
              <h3 className="text-lg font-bold text-blue-900 mb-2">📋 What happens next?</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• Transport provider receives an invitation email</li>
                <li>• They complete their KYC documentation</li>
                <li>• You review and approve their KYC</li>
                <li>• They can register trucks and start accepting orders</li>
              </ul>
            </div>

            {/* Invitation Form */}
            <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Transport Provider Details</h2>

              {/* Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Person Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., John Smith"
                  required
                />
              </div>

              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., john@transportco.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Invitation will be sent to this email</p>
              </div>

              {/* Phone */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., +968 9123 4567"
                  required
                />
              </div>

              {/* Company Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Swift Transport LLC"
                  required
                />
              </div>

              {/* Personal Message */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Personal Message (Optional)
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add a personal message to the invitation..."
                />
              </div>

              {/* Preview */}
              {name && email && (
                <div className="bg-green-50 rounded-lg p-4 mb-6 border border-green-200">
                  <p className="text-sm font-medium text-green-900 mb-2">✉️ Invitation Preview</p>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>To: <strong>{name}</strong> ({email})</p>
                    <p>Company: <strong>{companyName}</strong></p>
                    <p>From: <strong>{user.name ?? `${user.firstName} ${user.lastName}`}</strong></p>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? '⏳ Sending Invitation...' : '📤 Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/seller/dashboard')}
                  className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>

            {/* Help Section */}
            <div className="mt-8 bg-gray-50 rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-3">💡 Tips for inviting TSPs</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>✓ Verify the transport provider's credentials before inviting</li>
                <li>✓ Ensure they have the necessary licenses and insurance</li>
                <li>✓ Check their fleet capacity and service areas</li>
                <li>✓ Discuss payment terms and service agreements</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}