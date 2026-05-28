'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatCard from '@/src/components/dashboard/StatCard';
import {

getOrders,

getTrucks,

getKYCDocuments,

getCurrentUser,

getSellerConnections,

} from '@/src/lib/demo-data';
// ── Types ─────────────────────────────────────────────────────
type QuickActionColor = 'blue' | 'green' | 'orange' | 'purple' | 'yellow';

interface QuickActionCardProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  color: QuickActionColor;
  badge?: number;
}

export default function SellerDashboard() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [orders,  setOrders]  = useState<any[]>([]);
  const [trucks,  setTrucks]  = useState<any[]>([]);
  const [kycDocs, setKycDocs] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

 useEffect(() => {

setMounted(true);

const currentUser =
getCurrentUser();

if (
!currentUser
||
currentUser.role !==
'SELLER_MANAGER'
) {

router.push('/');

return;

}

setUser(
currentUser
);

loadData(
currentUser
);

}, [router]);

  const loadData = (currentUser: any) => {
    const allOrders = getOrders();
    const allTrucks = getTrucks();
    const allKYC    = getKYCDocuments();
    setOrders(allOrders.filter((o: any) => o.workspaceId === currentUser?.workspaceId));
    setTrucks(allTrucks.filter((t: any) => t.workspaceId === currentUser?.workspaceId));
    setKycDocs(allKYC);
  };

  if (!mounted) return null;
  if (
!user
||
user.role !==
'SELLER_MANAGER'
) {

return null;

}
  // ── Derived ───────────────────────────────────────────────
  const pendingOrders   = orders.filter(o => o.status === 'PLACED').length;
  const activeOrders    = orders.filter(o => !['COMPLETED', 'CANCELLED', 'PLACED'].includes(o.status)).length;
  const pendingKYC      = kycDocs.filter(k => k.reviewStatus === 'PENDING').length;
  const availableTrucks = trucks.filter(t => t.status === 'IDLE').length;


  const sellerConnections =

getSellerConnections()

.filter(
r=>
r.sellerId===
user.id
);

const pendingConnections =

sellerConnections.filter(
r=>
r.status===
'PENDING'
).length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userRole={user.role} />

      <div className="flex-1">
        <Header user={user} />

        <main className="p-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-8 mb-8 text-white">
            <h1 className="text-3xl font-bold mb-2">Welcome, {user.firstName}! 🏢</h1>
            <p className="text-blue-100">Manage your depot, orders, and transport providers</p>
          </div>

<div className="
bg-white
rounded-xl
border
border-blue-200
p-6
mb-8
">

<div className="
flex
items-center
justify-between
mb-4
">

<div>

<h2 className="
text-2xl
font-bold
text-gray-900
">

Seller Integration Code

</h2>

<p className="
text-gray-500
text-sm
mt-1
">

Share this private code only with approved transporters

</p>

</div>

<div className="
bg-green-100
text-green-700
font-bold
text-xs
px-3
py-1
rounded-full
">

PRIVATE

</div>

</div>

<div className="
bg-gray-50
border
rounded-xl
p-5
flex
items-center
justify-between
"
>

<div>

<p className="
text-sm
text-gray-500
mb-2
">

Unique Seller Code

</p>

<p className="
text-3xl
font-black
tracking-wider
text-blue-700
">

{
user?.sellerCode
||
'NO-CODE'
}

</p>

</div>

<button
onClick={() => {

const code =
user?.sellerCode || '';

if (
navigator?.clipboard
?.writeText
) {

navigator.clipboard
.writeText(code);

alert(
'Seller code copied'
);

} else {

window.prompt(
'Copy Seller Code:',
code
);

}

}}

className="
bg-blue-600
hover:bg-blue-700
text-white
font-semibold
px-5
py-3
rounded-xl
transition-colors
"
>

Copy Code

</button>

</div>

</div>

          {/* Stat Cards — yellow swapped to orange to match StatCard's allowed colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard title="Pending Orders"   value={pendingOrders}   icon="📦" color="orange" />
            <StatCard title="Active Orders"    value={activeOrders}    icon="🔄" color="blue"   />
            <StatCard title="Pending KYC"      value={pendingKYC}      icon="📄" color="orange" />
            <StatCard title="Available Trucks" value={availableTrucks} icon="🚛" color="green"  />
          </div>

          {/* KYC Alert */}
          {pendingKYC > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <span className="text-3xl">⚠️</span>
                <div className="flex-1">
                  <h3 className="font-bold text-yellow-900 mb-1">KYC Documents Need Review</h3>
                  <p className="text-yellow-800 text-sm mb-3">
                    {pendingKYC} Transport Provider{pendingKYC > 1 ? 's' : ''} waiting for KYC approval
                  </p>
                  <button
                    onClick={() => router.push('/seller/kyc-review')}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Review KYC Documents →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Orders Alert */}
          {pendingOrders > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-4">
                <span className="text-3xl">📦</span>
                <div className="flex-1">
                  <h3 className="font-bold text-orange-900 mb-1">New Orders Received</h3>
                  <p className="text-orange-800 text-sm mb-3">
                    {pendingOrders} new order{pendingOrders > 1 ? 's' : ''} waiting for your review
                  </p>
                  <button
                    onClick={() => router.push('/seller/orders')}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Review Orders →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <QuickActionCard

icon="🔗"

title="Transport Connections"

description="Approve transporter seller requests"

onClick={() =>
router.push(
'/seller/connections'
)
}

color="purple"

badge={
pendingConnections > 0
? pendingConnections
: undefined
}

/>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <QuickActionCard icon="✉️" title="Invite TSP"       description="Send invitations to transport providers" onClick={() => router.push('/seller/invite-tsp')}        color="blue"   />
              <QuickActionCard icon="📄" title="Review KYC"       description="Approve or reject KYC documents"         onClick={() => router.push('/seller/kyc-review')}        color="yellow" badge={pendingKYC      > 0 ? pendingKYC      : undefined} />
              <QuickActionCard icon="📦" title="Manage Orders"    description="View and assign orders"                  onClick={() => router.push('/seller/orders')}            color="green"  badge={pendingOrders   > 0 ? pendingOrders   : undefined} />
              <QuickActionCard icon="🗺️" title="Fleet Monitor"    description="Track trucks in real-time"               onClick={() => router.push('/seller/fleet-monitor')}     color="purple" />
              <QuickActionCard icon="🎫" title="Sensor Requests"  description="Review integration requests"             onClick={() => router.push('/seller/sensor-requests')}   color="blue"   />
              <QuickActionCard icon="📊" title="Analytics"        description="View performance metrics"                onClick={() => router.push('/seller/analytics')}         color="blue"   />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {orders.slice(0, 5).map(order => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">Order #{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-600">{order.volume}L {order.fuelType} - {order.status}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-center text-gray-500 py-8">No recent activity</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── QuickActionCard Component ──────────────────────────────────
function QuickActionCard({ icon, title, description, onClick, color, badge }: QuickActionCardProps) {
  const colorClasses: Record<QuickActionColor, string> = {
    blue:   'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    green:  'border-green-200 hover:border-green-400 hover:bg-green-50',
    orange: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50',
    purple: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50',
    yellow: 'border-yellow-200 hover:border-yellow-400 hover:bg-yellow-50',
  };

  return (
    <button
      onClick={onClick}
      className={`relative text-left p-6 bg-white border-2 rounded-xl transition-all hover:shadow-lg ${colorClasses[color]}`}
    >
      {badge && badge > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
          {badge}
        </span>
      )}
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </button>
  );
}