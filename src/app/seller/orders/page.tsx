'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import WorkflowTimeline from '@/src/components/workflow/WorkflowTimeline';
import {
  getCurrentUser,
 getUsers,
getOrders,
getTrucks,
getSellerConnections,
  updateOrder,
  addNotification,
} from '@/src/lib/demo-data';

export default function SellerOrdersPage() {
  const router = useRouter();
  const [user,                   setUser]                   = useState<any>(null);
  const [orders,                 setOrders]                 = useState<any[]>([]);
  const [transportProviders,     setTransportProviders]     = useState<any[]>([]);
  const [selectedOrder,          setSelectedOrder]          = useState<any>(null);
  const [showModal,              setShowModal]              = useState(false);
  const [showAssignModal,        setShowAssignModal]        = useState(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<any>(null);
  const [selectedTSP,            setSelectedTSP]            = useState('');
  const [mounted,                setMounted]                = useState(false);

  useEffect(() => {
    setMounted(true);
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'SELLER_MANAGER') {
      router.push('/');
      return;
    }
   setUser(currentUser);

loadOrders(currentUser);

loadTransportProvidersForSeller(
currentUser
);
  }, []);

  useEffect(() => {
    if(user && showAssignModal){

loadTransportProvidersForSeller(
user
);

}
  }, [showAssignModal]);

  const loadOrders = (currentUser: any) => {
    const allOrders = getOrders();
    const myOrders = allOrders.filter((o: any) => {
      const isNewPending  = o.status === 'PENDING' || o.status === 'PLACED';
      const isMyWorkspace = o.workspaceId && o.workspaceId === currentUser?.workspaceId;
      return isNewPending || isMyWorkspace;
    });
    const sorted = myOrders
      .map((o: any) => ({ ...o, createdAt: new Date(o.createdAt) }))
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
    setOrders(sorted);
  };

  // ✅ FIXED — removed workspaceId filter, show ALL verified TSPs
const loadTransportProvidersForSeller = (
currentSeller:any
) => {

if(!user) return;

const allUsers =
getUsers();

const allTrucks =
getTrucks();

const connections =
getSellerConnections();

// ── Only approved seller-linked transporters ──

const approvedConnections =

connections.filter(
(c:any)=>

c.sellerId === currentSeller.id
&&

c.status ===
'APPROVED'
);

// ── Extract transporter IDs ──

const linkedTransporterIds =

approvedConnections.map(
(c:any)=>

c.transporterId
);

// ── Only linked transporters ──

const tsps =

allUsers.filter(
(u:any)=>

u.role ===
'TRANSPORT_ADMIN'

&&

u.verified === true

&&

linkedTransporterIds.includes(
u.id
)
);

// ── Truck stats ──

const tspsWithTrucks =

tsps.map(
(tsp:any)=>{

const tspTrucks =

allTrucks.filter(
(t:any)=>

t.tspId ===
tsp.id
);

const idleTrucks =

tspTrucks.filter(
(t:any)=>

t.status ===
'IDLE'

||

t.status ===
'ACTIVE'
);

return {

...tsp,

totalTrucks:
tspTrucks.length,

availableTrucks:
idleTrucks.length,

};

}
);

setTransportProviders(
tspsWithTrucks
);

};

  const handleAcceptOrder = (orderId: string) => {
    if (!user) return;
    updateOrder(orderId, {
      workspaceId: user.workspaceId,
      status:      'ACCEPTED_BY_SELLER',
    });
    const order = orders.find((o: any) => o.id === orderId);
    if (order?.clientId) {
      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    order.clientId,
        type:      'ORDER_ACCEPTED',
        title:     '✅ Order Accepted',
        message:   `Your order #${orderId.slice(0, 8)} has been accepted and is being processed.`,
        read:      false,
        createdAt: new Date(),
      });
    }
    loadOrders(user);
    alert('✅ Order accepted! You can now assign it to a transport provider.');
  };

  const handleRejectOrder = (orderId: string) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    updateOrder(orderId, { status: 'CANCELLED' });
    const order = orders.find((o: any) => o.id === orderId);
    if (order?.clientId) {
      addNotification({
        id:        `notif-${Date.now()}`,
        userId:    order.clientId,
        type:      'ORDER_REJECTED',
        title:     '❌ Order Rejected',
        message:   `Your order #${orderId.slice(0, 8)} was rejected: ${reason}`,
        read:      false,
        createdAt: new Date(),
      });
    }
    loadOrders(user);
    alert('✅ Order rejected and client notified.');
  };

  const handleOpenAssignModal = (order: any) => {
    setSelectedOrderForAssign(order);
    setSelectedTSP('');
    setShowAssignModal(true);
  };

  const handleAssignToTSP = () => {
    if (!selectedTSP || !selectedOrderForAssign || !user) {
      alert('❌ Please select a transport provider');
      return;
    }
    const tsp = transportProviders.find((t: any) => t.id === selectedTSP);
    if (!tsp) return;

    updateOrder(selectedOrderForAssign.id, {
      status:        'ASSIGNED_TO_TSP',
      assignedTSPId: tsp.id,
      assignedAt:    new Date(),
    });

    addNotification({
      id:        `notif-${Date.now()}`,
      userId:    tsp.id,
      type:      'ORDER_ASSIGNED_TO_TSP',
      title:     '📦 New Order Assigned',
      message:   `You have been assigned order #${selectedOrderForAssign.id.slice(0, 8)}. Deliver ${selectedOrderForAssign.volume}L of ${selectedOrderForAssign.fuelType} to ${selectedOrderForAssign.destinationName ?? selectedOrderForAssign.destination ?? '—'}. Please assign a truck and driver.`,
      read:      false,
      createdAt: new Date(),
    });

    if (selectedOrderForAssign.clientId) {
      addNotification({
        id:        `notif-${Date.now()}-client`,
        userId:    selectedOrderForAssign.clientId,
        type:      'ORDER_PROGRESS',
        title:     '🚛 Transport Provider Assigned',
        message:   `Your order has been assigned to ${tsp.companyName || tsp.firstName}. They will assign a driver shortly.`,
        read:      false,
        createdAt: new Date(),
      });
    }

    alert(`✅ Order assigned to ${tsp.companyName || tsp.firstName}!`);
    loadOrders(user);
    setShowAssignModal(false);
    setSelectedOrderForAssign(null);
  };

  if (!mounted || !user) return null;

  const pendingOrders   = orders.filter((o: any) => o.status === 'PENDING' || o.status === 'PLACED');
  const acceptedOrders  = orders.filter((o: any) => o.status === 'ACCEPTED_BY_SELLER');
  const assignedToTSP   = orders.filter((o: any) => o.status === 'ASSIGNED_TO_TSP');
  const activeOrders    = orders.filter((o: any) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(o.status));
  const completedOrders = orders.filter((o: any) => o.status === 'COMPLETED');

  const getDestination = (order: any) =>
    order.destinationName ?? order.destination ?? '—';

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Orders Management 📦</h1>
              <p className="text-gray-600">Review, accept, and assign orders to transport providers</p>
            </div>
            <button
              onClick={() => { loadOrders(user); loadTransportProvidersForSeller(
user
); }}
              className="text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors"
            >
              🔄 Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-6 gap-4 mb-8">
            {[
              { label: 'Total',    value: orders.length,          color: 'text-gray-900'   },
              { label: 'Pending',  value: pendingOrders.length,   color: 'text-orange-600' },
              { label: 'Accepted', value: acceptedOrders.length,  color: 'text-purple-600' },
              { label: 'With TSP', value: assignedToTSP.length,   color: 'text-yellow-600' },
              { label: 'Active',   value: activeOrders.length,    color: 'text-blue-600'   },
              { label: 'Done',     value: completedOrders.length, color: 'text-green-600'  },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-5 border border-gray-200 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Pending Review */}
          {pendingOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🟠 Pending Review ({pendingOrders.length})
              </h2>
              <div className="space-y-4">
                {pendingOrders.map((order: any) => (
                  <div key={order.id} className="bg-white rounded-xl p-6 border-2 border-orange-200 shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</h3>
                        <p className="text-sm text-gray-500">
                          {order.clientName} &nbsp;•&nbsp; {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {order.urgency === 'URGENT' && (
                          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                            🚨 URGENT
                          </span>
                        )}
                        <StatusBadge status={order.status} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Fuel Type</p>
                        <p className="font-semibold">{order.fuelType}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Volume</p>
                        <p className="font-semibold">{order.volume?.toLocaleString()} L</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-1">Destination</p>
                        <p className="font-semibold text-sm truncate">{getDestination(order)}</p>
                      </div>
                      {order.tankName && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-blue-600 mb-1">🛢️ For Tank</p>
                          <p className="font-semibold text-blue-800 text-sm truncate">{order.tankName}</p>
                        </div>
                      )}
                    </div>

                    {order.notes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                        📝 {order.notes}
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button onClick={() => handleAcceptOrder(order.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                        ✓ Accept
                      </button>
                      <button onClick={() => handleRejectOrder(order.id)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                        ✕ Reject
                      </button>
                      <button onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                        className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                        Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Ready to Assign */}
          {acceptedOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🟣 Ready to Assign ({acceptedOrders.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {acceptedOrders.map((order: any) => (
                  <div key={order.id} className="bg-white rounded-xl p-6 border-2 border-purple-200 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</h3>
                        <p className="text-sm text-gray-500">{order.clientName}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="space-y-1 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fuel</span>
                        <span className="font-medium">{order.volume?.toLocaleString()}L {order.fuelType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">To</span>
                        <span className="font-medium text-right">{getDestination(order)}</span>
                      </div>
                      {order.tankName && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tank</span>
                          <span className="font-medium text-blue-600">🛢️ {order.tankName}</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleOpenAssignModal(order)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                      🚛 Assign to Transport Provider
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Assigned to TSP */}
          {assignedToTSP.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🟡 With Transport Provider ({assignedToTSP.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {assignedToTSP.map((order: any) => {
                  const tsp = transportProviders.find(t => t.id === order.assignedTSPId);
                  return (
                    <div key={order.id} className="bg-white rounded-xl p-6 border-2 border-yellow-200 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</h3>
                        <StatusBadge status={order.status} />
                      </div>
                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Fuel</span>
                          <span className="font-medium">{order.volume?.toLocaleString()}L {order.fuelType}</span>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-2 border border-yellow-200">
                          <p className="text-xs text-yellow-700 font-medium">🚛 Assigned TSP</p>
                          <p className="font-semibold text-yellow-900 text-sm">
                            {tsp?.companyName ?? tsp?.firstName ?? order.assignedTSPId}
                          </p>
                          <p className="text-xs text-yellow-700 mt-0.5">Awaiting driver assignment…</p>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-colors">
                        View Details
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Active Deliveries */}
          {activeOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                🔵 Active Deliveries ({activeOrders.length})
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {activeOrders.map((order: any) => (
                  <div key={order.id} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</h3>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fuel</span>
                        <span className="font-medium">{order.volume?.toLocaleString()}L {order.fuelType}</span>
                      </div>
                      {order.assignedTruckRegistration && (
                        <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                          <p className="text-xs text-blue-700 font-medium">🚛 {order.assignedTruckRegistration}</p>
                          <p className="text-xs text-blue-600">{order.assignedDriverName} • {order.assignedDriverPhone}</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-colors">
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {completedOrders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                ✅ Completed ({completedOrders.length})
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {completedOrders.map((order: any) => (
                  <div key={order.id} className="bg-white rounded-xl p-4 border border-green-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900">#{order.id.slice(0, 8)}</p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-gray-500">{order.volume?.toLocaleString()}L {order.fuelType}</p>
                    <p className="text-xs text-gray-400 mt-1">{order.clientName}</p>
                    <button onClick={() => { setSelectedOrder(order); setShowModal(true); }}
                      className="w-full mt-3 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded-lg transition-colors">
                      View
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {orders.length === 0 && (
            <div className="bg-white rounded-xl p-16 text-center border border-gray-200">
              <span className="text-6xl mb-4 block">📦</span>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-500">Orders placed by clients will appear here automatically.</p>
            </div>
          )}
        </main>
      </div>

      {/* Assign to TSP Modal */}
      {showAssignModal && selectedOrderForAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold">Assign to Transport Provider</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 mb-1">Order</p>
              <p className="font-bold text-lg">#{selectedOrderForAssign.id.slice(0, 8)}</p>
              <p className="text-sm text-gray-700">
                {selectedOrderForAssign.volume?.toLocaleString()}L {selectedOrderForAssign.fuelType} → {getDestination(selectedOrderForAssign)}
              </p>
              {selectedOrderForAssign.tankName && (
                <p className="text-sm text-blue-600 mt-1">🛢️ For tank: {selectedOrderForAssign.tankName}</p>
              )}
            </div>

            {transportProviders.length > 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Select Transport Provider ({transportProviders.length} verified):
                </p>
                <div className="space-y-3 mb-6">
                  {transportProviders.map((tsp: any) => (
                    <button key={tsp.id} onClick={() => setSelectedTSP(tsp.id)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        selectedTSP === tsp.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {tsp.companyName || `${tsp.firstName} ${tsp.lastName}`}
                          </p>
                          <p className="text-sm text-gray-500">{tsp.email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {tsp.totalTrucks} trucks &nbsp;•&nbsp;
                            <span className={tsp.availableTrucks > 0 ? 'text-green-600 font-semibold' : 'text-red-500'}>
                              {tsp.availableTrucks} available (IDLE)
                            </span>
                          </p>
                        </div>
                        {selectedTSP === tsp.id && (
                          <span className="text-blue-600 text-2xl font-bold">✓</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleAssignToTSP}
                  disabled={!selectedTSP}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  ✓ Assign Order
                </button>
              </>
            ) : (
              <div className="text-center py-10">
                <span className="text-5xl mb-4 block">🚛</span>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Verified Transport Providers</h4>
                <p className="text-gray-500 text-sm mb-2">
                  Transport providers must be KYC-approved before they appear here.
                </p>
                <p className="text-xs text-gray-400">
                  Go to KYC Review → approve a transport provider → they'll appear here.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowAssignModal(false)}
              className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold">Order Details</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Order ID</p>
                  <p className="font-semibold">#{selectedOrder.id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <div className="mt-1"><StatusBadge status={selectedOrder.status} /></div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="font-semibold">{selectedOrder.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fuel</p>
                  <p className="font-semibold">{selectedOrder.volume?.toLocaleString()}L {selectedOrder.fuelType}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Destination</p>
                  <p className="font-semibold">{getDestination(selectedOrder)}</p>
                </div>
                {selectedOrder.tankName && (
                  <div>
                    <p className="text-xs text-gray-500">Tank</p>
                    <p className="font-semibold text-blue-600">🛢️ {selectedOrder.tankName}</p>
                  </div>
                )}
              </div>

              {selectedOrder.notes && (
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <p className="text-xs text-yellow-700 font-medium mb-1">Notes</p>
                  <p className="text-sm text-yellow-900">{selectedOrder.notes}</p>
                </div>
              )}

              {selectedOrder.assignedTSPId && (
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <p className="text-xs text-yellow-700 font-medium mb-1">🚛 Transport Provider</p>
                  <p className="font-semibold text-yellow-900">
                    {transportProviders.find(t => t.id === selectedOrder.assignedTSPId)?.companyName
                      ?? selectedOrder.assignedTSPId}
                  </p>
                </div>
              )}

              {selectedOrder.assignedTruckRegistration && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-xs text-blue-700 font-medium mb-1">🚛 Assigned Truck</p>
                  <p className="font-semibold">{selectedOrder.assignedTruckRegistration}</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Driver: {selectedOrder.assignedDriverName} • {selectedOrder.assignedDriverPhone}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-2">Workflow Timeline</p>
                <WorkflowTimeline order={selectedOrder} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}