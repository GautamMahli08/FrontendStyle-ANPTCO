'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser } from '@/src/lib/user-store';

type TicketCategory = 'SENSOR_ISSUE' | 'ORDER_DISPUTE' | 'ACCOUNT_ACCESS' | 'BILLING' | 'OTHER';

const CATEGORIES: { key: TicketCategory; label: string; icon: string }[] = [
  { key: 'SENSOR_ISSUE',   label: 'Sensor / Device Issue',  icon: '📡' },
  { key: 'ORDER_DISPUTE',  label: 'Order Dispute',          icon: '📦' },
  { key: 'ACCOUNT_ACCESS', label: 'Account / Access',       icon: '🔑' },
  { key: 'BILLING',        label: 'Billing',                icon: '💳' },
  { key: 'OTHER',          label: 'Other',                  icon: '💬' },
];

// Simulated in-memory ticket list (resets on page reload — no backend yet)
const LOCAL_TICKETS: { id: string; category: TicketCategory; subject: string; message: string; submittedAt: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' }[] = [];

export default function AdminTicketsPage() {
  const router = useRouter();
  const user   = getCurrentUser();

  const [tickets,   setTickets]   = useState([...LOCAL_TICKETS]);
  const [showForm,  setShowForm]  = useState(false);
  const [category,  setCategory]  = useState<TicketCategory>('SENSOR_ISSUE');
  const [subject,   setSubject]   = useState('');
  const [message,   setMessage]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success,   setSuccess]   = useState(false);

  useEffect(() => { if (!user) router.replace('/auth/login'); }, [router, user]);
  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600)); // simulate network
    const ticket = {
      id:          Math.random().toString(36).slice(2, 9).toUpperCase(),
      category,
      subject:     subject.trim(),
      message:     message.trim(),
      submittedAt: new Date().toISOString(),
      status:      'OPEN' as const,
    };
    LOCAL_TICKETS.unshift(ticket);
    setTickets([...LOCAL_TICKETS]);
    setShowForm(false);
    setSubject('');
    setMessage('');
    setSuccess(true);
    setSubmitting(false);
    setTimeout(() => setSuccess(false), 4000);
  };

  const STATUS_COLOR: Record<string, string> = {
    OPEN:        'bg-yellow-100 text-yellow-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    RESOLVED:    'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="PLATFORM_ADMIN" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Support Tickets" user={user} />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm font-semibold">
              Ticket submitted — our team will respond within 24 hours.
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Support Tickets</h2>
              <p className="text-xs text-slate-400 mt-0.5">Raise an issue or track existing requests.</p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + New Ticket
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 max-w-2xl shadow-sm">
              <h3 className="font-semibold text-slate-800">New Support Request</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c.key} type="button"
                      onClick={() => setCategory(c.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        category === c.key
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      <span>{c.icon}</span> {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Subject *</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Brief description of the issue"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Details *</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe the issue in detail. Include order IDs, truck IDs, or any relevant reference numbers."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  required />
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={submitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg transition-colors">
                  {submitting ? 'Submitting…' : 'Submit Ticket'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Ticket list */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Your Tickets ({tickets.length})</h3>
            </div>
            {tickets.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="text-3xl mb-2">🎫</p>
                <p className="text-sm">No tickets yet.</p>
                <p className="text-xs mt-1">Open one above if you need help.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tickets.map(t => (
                  <div key={t.id} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-400">#{t.id}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                          {CATEGORIES.find(c => c.key === t.category)?.label ?? t.category}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{t.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{t.message}</p>
                      <p className="text-[11px] text-slate-300 mt-1">{new Date(t.submittedAt).toLocaleString()}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 max-w-2xl">
            <h3 className="font-semibold text-slate-700 text-sm mb-3">Direct Support Channels</h3>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>📧</span>
                <span>Email: <strong>support@anptco.com</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span>⏰</span>
                <span>Response time: within 24 hours on business days</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🚨</span>
                <span>Critical issues (active delivery blocked): call +968 2400 0000</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
