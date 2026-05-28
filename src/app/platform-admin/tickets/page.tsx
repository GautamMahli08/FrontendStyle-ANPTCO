'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, addNotification } from '@/src/lib/demo-data';

// ── Mock Tickets ──────────────────────────────────────────────
const mockTickets: any[] = [
  {
    id: 'ticket-001',
    userId: 'tsp-001',
    userName: 'Swift Transport LLC',
    userRole: 'TRANSPORT_ADMIN',
    subject: 'QR Code Not Generating',
    description: 'Truck OM-1234 registration completed but QR code is not showing up in the system.',
    status: 'OPEN',
    priority: 'HIGH',
    category: 'TECHNICAL',
    createdAt: new Date('2026-02-07T10:30:00'),
    updatedAt: new Date('2026-02-07T10:30:00'),
  },
  {
    id: 'ticket-002',
    userId: 'tsp-002',
    userName: 'Express Logistics',
    userRole: 'TRANSPORT_ADMIN',
    subject: 'Payment Pending for Completed Order',
    description: 'Order #order-2024 was completed 5 days ago but payment status still shows pending.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    category: 'BILLING',
    createdAt: new Date('2026-02-05T14:20:00'),
    updatedAt: new Date('2026-02-06T09:15:00'),
    response: 'Payment is being processed. Expected to reflect in 2-3 business days.',
    assignedTo: 'admin-001',
  },
  {
    id: 'ticket-003',
    userId: 'client-001',
    userName: 'ABC Corporation',
    userRole: 'CLIENT',
    subject: 'Order Tracking Not Working',
    description: 'Cannot see real-time location of my delivery. Map shows blank.',
    status: 'RESOLVED',
    priority: 'HIGH',
    category: 'TECHNICAL',
    createdAt: new Date('2026-02-03T08:45:00'),
    updatedAt: new Date('2026-02-03T11:30:00'),
    response: 'GPS integration issue fixed. Tracking now working properly.',
    resolvedAt: new Date('2026-02-03T11:30:00'),
    assignedTo: 'admin-001',
  },
  {
    id: 'ticket-004',
    userId: 'seller-001',
    userName: 'OilCo Manager',
    userRole: 'SELLER_MANAGER',
    subject: 'Unable to Approve KYC Documents',
    description: 'KYC review page shows error when trying to approve transport provider documents.',
    status: 'OPEN',
    priority: 'MEDIUM',
    category: 'TECHNICAL',
    createdAt: new Date('2026-02-06T16:00:00'),
    updatedAt: new Date('2026-02-06T16:00:00'),
  },
  {
    id: 'ticket-005',
    userId: 'tsp-003',
    userName: 'Rapid Delivery Services',
    userRole: 'TRANSPORT_ADMIN',
    subject: 'Request for KYC Document Re-upload',
    description: 'Insurance certificate expired. Need to upload updated document.',
    status: 'IN_PROGRESS',
    priority: 'LOW',
    category: 'KYC',
    createdAt: new Date('2026-02-01T16:00:00'),
    updatedAt: new Date('2026-02-02T10:00:00'),
    response: 'Document upload feature has been enabled for your account.',
    assignedTo: 'admin-002',
  },
  {
    id: 'ticket-006',
    userId: 'client-002',
    userName: 'XYZ Industries',
    userRole: 'CLIENT',
    subject: 'Feature Request: Bulk Order Placement',
    description: 'Would like ability to place multiple orders at once instead of one by one.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'FEATURE',
    createdAt: new Date('2026-01-28T12:00:00'),
    updatedAt: new Date('2026-01-28T12:00:00'),
  },
];

export default function AdminTicketsPage() {
  const router = useRouter();
  const [user,           setUser]           = useState<any>(null);
  const [mounted,        setMounted]        = useState(false);
  const [tickets,        setTickets]        = useState<any[]>(mockTickets);
  const [filter,         setFilter]         = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [responseText,   setResponseText]   = useState('');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  if (!mounted) return null;
  if (!user)                          { router.push('/'); return null; }
  if (user.role !== 'PLATFORM_ADMIN') { router.push('/'); return null; }

  // ── Handlers ──────────────────────────────────────────────
  const handleAssignToMe = (ticketId: string) => {
    setTickets(prev => prev.map(t =>
      t.id === ticketId
        ? { ...t, assignedTo: user.id, status: 'IN_PROGRESS', updatedAt: new Date() }
        : t
    ));
    alert('✅ Ticket assigned to you!');
  };

  const handleRespond = (ticketId: string) => {
    if (!responseText.trim()) { alert('❌ Please enter a response'); return; }

    const ticket = tickets.find(t => t.id === ticketId);

    setTickets(prev => prev.map(t =>
      t.id === ticketId
        ? { ...t, response: responseText, status: 'IN_PROGRESS', assignedTo: user.id, updatedAt: new Date() }
        : t
    ));

    if (ticket) {
      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    ticket.userId,
        type:      'TICKET_RESPONSE',
        title:     '💬 Support Ticket Update',
        message:   `Your ticket "${ticket.subject}" has been updated with a response.`,
        read:      false,
        createdAt: new Date(),
      });
    }

    setResponseText('');
    alert('✅ Response sent!');
  };

  const handleResolve = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);

    setTickets(prev => prev.map(t =>
      t.id === ticketId
        ? { ...t, status: 'RESOLVED', resolvedAt: new Date(), updatedAt: new Date() }
        : t
    ));

    if (ticket) {
      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    ticket.userId,
        type:      'TICKET_RESOLVED',
        title:     '✅ Ticket Resolved',
        message:   `Your ticket "${ticket.subject}" has been resolved.`,
        read:      false,
        createdAt: new Date(),
      });
    }

    setSelectedTicket(null);
    alert('✅ Ticket marked as resolved!');
  };

  // ── Derived ───────────────────────────────────────────────
  const filteredTickets    = filter === 'ALL' ? tickets : tickets.filter(t => t.status === filter);
  const openTickets        = tickets.filter(t => t.status === 'OPEN').length;
  const inProgressTickets  = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolvedTickets    = tickets.filter(t => t.status === 'RESOLVED').length;
  const myTickets          = tickets.filter(t => t.assignedTo === user.id).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Tickets 🎫</h1>
            <p className="text-gray-600">Manage support requests from all users</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-6 mb-8">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Total Tickets</p>
              <p className="text-3xl font-bold text-gray-900">{tickets.length}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Open</p>
              <p className="text-3xl font-bold text-orange-600">{openTickets}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">In Progress</p>
              <p className="text-3xl font-bold text-blue-600">{inProgressTickets}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Resolved</p>
              <p className="text-3xl font-bold text-green-600">{resolvedTickets}</p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Assigned to Me</p>
              <p className="text-3xl font-bold text-purple-600">{myTickets}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              {[
                { key: 'ALL',         label: `All (${tickets.length})`,            active: 'bg-blue-600'   },
                { key: 'OPEN',        label: `Open (${openTickets})`,              active: 'bg-orange-600' },
                { key: 'IN_PROGRESS', label: `In Progress (${inProgressTickets})`, active: 'bg-blue-600'   },
                { key: 'RESOLVED',    label: `Resolved (${resolvedTickets})`,      active: 'bg-green-600'  },
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

          {/* Tickets List */}
          <div className="space-y-4">
            {filteredTickets.map(ticket => (
              <div
                key={ticket.id}
                className="bg-white rounded-xl p-6 border-2 border-gray-200 hover:border-blue-300 transition-all cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">{ticket.subject}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        ticket.priority === 'HIGH'   ? 'bg-red-100 text-red-700' :
                        ticket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                                       'bg-gray-100 text-gray-700'
                      }`}>
                        {ticket.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{ticket.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                      <span>🎫 {ticket.id}</span>
                      <span>👤 {ticket.userName}</span>
                      <span>🏷️ {ticket.userRole.replace('_', ' ')}</span>
                      <span>📁 {ticket.category}</span>
                      <span>🕒 {new Date(ticket.createdAt).toLocaleDateString()}</span>
                    </div>
                    {ticket.assignedTo && (
                      <span className="inline-block bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                        ✓ Assigned{ticket.assignedTo === user.id ? ' to you' : ''}
                      </span>
                    )}
                  </div>
                  <span className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                    ticket.status === 'OPEN'        ? 'bg-orange-100 text-orange-700' :
                    ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700'    :
                                                      'bg-green-100 text-green-700'
                  }`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>

                {ticket.response && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-3">
                    <p className="text-xs text-blue-800 font-medium mb-1">💬 Response</p>
                    <p className="text-sm text-blue-900">{ticket.response}</p>
                  </div>
                )}

                {ticket.status === 'OPEN' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleAssignToMe(ticket.id); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    📌 Assign to Me
                  </button>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedTicket.subject}</h2>
                <p className="text-sm text-gray-600">Ticket ID: {selectedTicket.id}</p>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="text-gray-500 hover:text-gray-700 text-2xl">
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex gap-3">
                <span className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedTicket.status === 'OPEN'        ? 'bg-orange-100 text-orange-700' :
                  selectedTicket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700'    :
                                                            'bg-green-100 text-green-700'
                }`}>
                  {selectedTicket.status.replace('_', ' ')}
                </span>
                <span className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedTicket.priority === 'HIGH'   ? 'bg-red-100 text-red-700' :
                  selectedTicket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                                         'bg-gray-100 text-gray-700'
                }`}>
                  {selectedTicket.priority} Priority
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Submitted By</p>
                <p className="font-semibold">{selectedTicket.userName}</p>
                <p className="text-sm text-gray-600">{selectedTicket.userRole.replace('_', ' ')}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Category</p>
                <p className="font-semibold">{selectedTicket.category}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Description</p>
                <p className="text-gray-900">{selectedTicket.description}</p>
              </div>

              {selectedTicket.response && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-800 font-medium mb-2">💬 Current Response</p>
                  <p className="text-blue-900">{selectedTicket.response}</p>
                </div>
              )}
            </div>

            {selectedTicket.status !== 'RESOLVED' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Add Response</label>
                <textarea
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Type your response to the user..."
                />
              </div>
            )}

            <div className="flex gap-3">
              {selectedTicket.status !== 'RESOLVED' && (
                <>
                  <button
                    onClick={() => handleRespond(selectedTicket.id)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    💬 Send Response
                  </button>
                  <button
                    onClick={() => handleResolve(selectedTicket.id)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    ✅ Mark Resolved
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedTicket(null)}
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