'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import { getCurrentUser, setCurrentUser, getUsers } from '@/src/lib/demo-data';

// Mock support tickets data
const mockTickets = [
  {
    id: 'ticket-001',
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
    subject: 'Payment Pending for Completed Order',
    description: 'Order #order-2024 was completed 5 days ago but payment status still shows pending.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    category: 'BILLING',
    createdAt: new Date('2026-02-05T14:20:00'),
    updatedAt: new Date('2026-02-06T09:15:00'),
    response: 'Payment is being processed. Expected to reflect in 2-3 business days.',
  },
  {
    id: 'ticket-003',
    subject: 'Driver App Login Issue',
    description: 'Driver cannot login to mobile app. Getting "Invalid credentials" error.',
    status: 'RESOLVED',
    priority: 'HIGH',
    category: 'TECHNICAL',
    createdAt: new Date('2026-02-03T08:45:00'),
    updatedAt: new Date('2026-02-03T11:30:00'),
    response: 'Password reset link sent. Issue resolved.',
    resolvedAt: new Date('2026-02-03T11:30:00'),
  },
  {
    id: 'ticket-004',
    subject: 'Request for Additional KYC Document Upload',
    description: 'Need to upload updated insurance certificate as previous one expired.',
    status: 'OPEN',
    priority: 'LOW',
    category: 'KYC',
    createdAt: new Date('2026-02-01T16:00:00'),
    updatedAt: new Date('2026-02-01T16:00:00'),
  },
];

export default function TransportTicketsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [tickets, setTickets] = useState(mockTickets);
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TECHNICAL');
  const [priority, setPriority] = useState('MEDIUM');

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  const handleRoleChange = (userId: string) => {
    const users = getUsers();
    const newUser = users.find(u => u.id === userId);
    if (newUser) {
      setUser(newUser);
      setCurrentUser(newUser);
      
      const routes: Record<string, string> = {
        PLATFORM_ADMIN: '/platform-admin/dashboard',
        SELLER_MANAGER: '/seller/dashboard',
        TRANSPORT_ADMIN: '/transport/dashboard',
        CLIENT: '/client/dashboard',
        DRIVER: '/driver/dashboard',
      };
      router.push(routes[newUser.role]);
    }
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();

    const newTicket = {
      id: `ticket-${Date.now()}`,
      subject,
      description,
      category,
      priority,
      status: 'OPEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setTickets([newTicket, ...tickets]);
    
    // Reset form
    setSubject('');
    setDescription('');
    setCategory('TECHNICAL');
    setPriority('MEDIUM');
    setShowNewTicket(false);

    alert('✅ Support ticket created successfully!');
  };

  if (!mounted) return null;
  
  if (!user) {
    router.push('/');
    return null;
  }
  
  if (user.role !== 'TRANSPORT_ADMIN') {
    router.push('/');
    return null;
  }

  const filteredTickets = filter === 'ALL' 
    ? tickets 
    : tickets.filter(t => t.status === filter);

  const openTickets = tickets.filter(t => t.status === 'OPEN').length;
  const inProgressTickets = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED').length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />
      
      <div className="flex-1">
        <Header user={user} />
        
        <main className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Tickets</h1>
              <p className="text-gray-600">Get help and support from the platform team</p>
            </div>
            <button
              onClick={() => setShowNewTicket(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              + Create New Ticket
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-6 mb-8">
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
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Filter:</span>
              <button
                onClick={() => setFilter('ALL')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'ALL' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({tickets.length})
              </button>
              <button
                onClick={() => setFilter('OPEN')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'OPEN' 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Open ({openTickets})
              </button>
              <button
                onClick={() => setFilter('IN_PROGRESS')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'IN_PROGRESS' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                In Progress ({inProgressTickets})
              </button>
              <button
                onClick={() => setFilter('RESOLVED')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'RESOLVED' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Resolved ({resolvedTickets})
              </button>
            </div>
          </div>

          {/* Tickets List */}
          {filteredTickets.length > 0 ? (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => (
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
                          ticket.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                          ticket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{ticket.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>🎫 {ticket.id}</span>
                        <span>📁 {ticket.category}</span>
                        <span>🕒 {ticket.createdAt.toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                      ticket.status === 'OPEN' ? 'bg-orange-100 text-orange-700' :
                      ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>

                  {ticket.response && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-blue-800 font-medium mb-1">💬 Response</p>
                      <p className="text-sm text-blue-900">{ticket.response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">🎫</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Tickets Found</h3>
              <p className="text-gray-600 mb-6">
                {filter === 'ALL' 
                  ? 'You haven\'t created any support tickets yet' 
                  : `No tickets with status "${filter}"`
                }
              </p>
              <button
                onClick={() => setShowNewTicket(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                + Create New Ticket
              </button>
            </div>
          )}
        </main>
      </div>

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create Support Ticket</h2>

            <form onSubmit={handleCreateTicket}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of your issue"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="TECHNICAL">Technical Issue</option>
                  <option value="BILLING">Billing / Payment</option>
                  <option value="KYC">KYC / Documentation</option>
                  <option value="GENERAL">General Inquiry</option>
                  <option value="FEATURE">Feature Request</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-2 px-4 rounded-lg font-medium transition-all ${
                        priority === p
                          ? p === 'HIGH' ? 'bg-red-600 text-white' :
                            p === 'MEDIUM' ? 'bg-yellow-600 text-white' :
                            'bg-gray-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Provide detailed information about your issue..."
                  required
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  🎫 Create Ticket
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewTicket(false)}
                  className="px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedTicket.subject}</h2>
                <p className="text-sm text-gray-600">Ticket ID: {selectedTicket.id}</p>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-3">
                <span className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedTicket.status === 'OPEN' ? 'bg-orange-100 text-orange-700' :
                  selectedTicket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {selectedTicket.status.replace('_', ' ')}
                </span>
                <span className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  selectedTicket.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                  selectedTicket.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedTicket.priority} Priority
                </span>
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
                  <p className="text-sm text-blue-800 font-medium mb-2">💬 Support Response</p>
                  <p className="text-blue-900">{selectedTicket.response}</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600">
                  Created: {selectedTicket.createdAt.toLocaleDateString()} at {selectedTicket.createdAt.toLocaleTimeString()}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Last Updated: {selectedTicket.updatedAt.toLocaleDateString()} at {selectedTicket.updatedAt.toLocaleTimeString()}
                </p>
                {selectedTicket.resolvedAt && (
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Resolved: {selectedTicket.resolvedAt.toLocaleDateString()} at {selectedTicket.resolvedAt.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedTicket(null)}
              className="w-full mt-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
