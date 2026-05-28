'use client';

import { useEffect,useState } from 'react';

import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';

import {

getCurrentUser,
getTrucks,
getOrders,
getNotifications,
getSensorRequests,

} from '@/src/lib/demo-data';

export default function TransportDashboardPage(){

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [trucks,setTrucks] =
useState<any[]>([]);

const [orders,setOrders] =
useState<any[]>([]);

const [notifications,
setNotifications] =
useState<any[]>([]);

const [sensorRequests,
setSensorRequests] =
useState<any[]>([]);

useEffect(()=>{

setMounted(true);

const currentUser =
getCurrentUser();

if(!currentUser) return;

setUser(
currentUser
);

loadDashboard(
currentUser
);

// ── Live Truck Movement ──

const interval =

setInterval(()=>{

simulateTruckMovement(
currentUser
);

},5000);

return ()=>clearInterval(interval);

},[]);

const loadDashboard = (
currentUser:any
)=>{

const allTrucks =
getTrucks();

const allOrders =
getOrders();

const allNotifications =
getNotifications();

const allSensorRequests =
getSensorRequests();

setTrucks(

allTrucks.filter(
(t:any)=>

t.tspId ===
currentUser.id
)

);

setOrders(

allOrders.filter(
(o:any)=>

o.transportProviderId ===
currentUser.id
)

);

setNotifications(

allNotifications.filter(
(n:any)=>

n.userId ===
currentUser.id
)

);

setSensorRequests(

allSensorRequests.filter(
(r:any)=>

r.transporterId ===
currentUser.id
)

);

};

const simulateTruckMovement = (
currentUser:any
)=>{

const allTrucks =
getTrucks();

const updated =

allTrucks.map(
(truck:any)=>{

if(
truck.tspId !==
currentUser.id
){

return truck;

}

// ── Move only active trucks ──

if(

truck.status ===
'EN_ROUTE'

||

truck.status ===
'ACTIVE'

){

return {

...truck,

currentLat:

truck.currentLat
+

(Math.random()-0.5)
*
0.002,

currentLng:

truck.currentLng
+

(Math.random()-0.5)
*
0.002,

speed:
40 + Math.floor(Math.random()*30),

fuelLevel:
Math.max(
20,
truck.fuelLevel - Math.random()*2
),

lastUpdated:
new Date(),

};

}

return truck;

}
);

localStorage.setItem(
'fuel_trucks',
JSON.stringify(updated)
);

loadDashboard(currentUser);

};

if(

!mounted

||

!user

||

user.role !==
'TRANSPORT_ADMIN'

){

return null;

}

const activeTrucks =

trucks.filter(
(t:any)=>

t.status ===
'ACTIVE'

||

t.status ===
'EN_ROUTE'
);

const pendingApprovals =

sensorRequests.filter(
(r:any)=>

r.status ===
'PENDING_ADMIN_APPROVAL'

||

r.status ===
'PENDING_SELLER_APPROVAL'
);

const liveAlerts =

notifications.filter(
(n:any)=>

!n.read
);

return(

<div className="
flex
min-h-screen
bg-gray-50
">

<Sidebar
userRole={user.role}
/>

<div className="flex-1">

<Header user={user}/>

<main className="p-8">

{/* Header */}

<div className="mb-8">

<h1 className="
text-3xl
font-bold
text-gray-900
mb-2
">

Transport Operations Dashboard 🚛

</h1>

<p className="text-gray-600">

Real-time fleet monitoring and logistics operations

</p>

</div>

{/* KPI Cards */}

<div className="
grid
grid-cols-1
md:grid-cols-4
gap-6
mb-8
">

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-sm
text-gray-500
mb-2
">

Total Trucks

</p>

<p className="
text-4xl
font-bold
text-gray-900
">

{
trucks.length
}

</p>

</div>

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-sm
text-gray-500
mb-2
">

Active Trucks

</p>

<p className="
text-4xl
font-bold
text-green-600
">

{
activeTrucks.length
}

</p>

</div>

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-sm
text-gray-500
mb-2
">

Pending Approval

</p>

<p className="
text-4xl
font-bold
text-orange-600
">

{
pendingApprovals.length
}

</p>

</div>

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-sm
text-gray-500
mb-2
">

Live Alerts

</p>

<p className="
text-4xl
font-bold
text-red-600
">

{
liveAlerts.length
}

</p>

</div>

</div>

{/* Live Fleet */}

<div className="
bg-white
rounded-xl
border
p-6
mb-8
">

<div className="
flex
items-center
justify-between
mb-6
">

<h2 className="
text-2xl
font-bold
">

Live Fleet Status

</h2>

<div className="
flex
items-center
gap-2
text-green-600
text-sm
font-medium
">

<div className="
w-2
h-2
bg-green-500
rounded-full
animate-pulse
"/>

LIVE

</div>

</div>

<div className="
space-y-4
">

{
trucks.length === 0

?

<div className="
text-center
py-12
text-gray-500
">

No trucks registered

</div>

:

trucks.map(
(truck:any)=>(

<div
key={truck.id}
className="
border
rounded-xl
p-5
hover:shadow-md
transition-shadow
"
>

<div className="
flex
flex-col
lg:flex-row
lg:items-center
lg:justify-between
gap-4
">

<div>

<div className="
flex
items-center
gap-3
mb-2
">

<h3 className="
text-xl
font-bold
">

{
truck.registrationNumber
}

</h3>

<StatusBadge
status={truck.status}
/>

</div>

<p className="
text-sm
text-gray-500
">

{
truck.truckType
}

•
Seller:

{' '}

{
truck.sellerName
||
'Not Linked'
}

</p>

</div>

<div className="
grid
grid-cols-2
md:grid-cols-4
gap-4
text-sm
">

<div>

<p className="
text-gray-500
">

Fuel

</p>

<p className="
font-bold
">

{
Math.round(
truck.fuelLevel || 80
)
}%

</p>

</div>

<div>

<p className="
text-gray-500
">

Speed

</p>

<p className="
font-bold
">

{
truck.speed || 0
}

km/h

</p>

</div>

<div>

<p className="
text-gray-500
">

GPS

</p>

<p className="
font-bold
text-green-600
">

LIVE

</p>

</div>

<div>

<p className="
text-gray-500
">

QR

</p>

<p className="
font-bold
">

{
truck.qrCode

?

'ACTIVE'

:

'PENDING'
}

</p>

</div>

</div>

</div>

{
truck.sensorConfigured
&&

<div className="
mt-4
bg-green-50
border
border-green-100
rounded-lg
p-3
text-sm
text-green-700
">

✅ Sensor integrated • Fuel monitoring active • Geofence tracking enabled

</div>
}

</div>

))
}

</div>

</div>

{/* Active Orders */}

<div className="
grid
lg:grid-cols-2
gap-8
">

<div className="
bg-white
rounded-xl
border
p-6
">

<h2 className="
text-2xl
font-bold
mb-6
">

Active Deliveries

</h2>

<div className="
space-y-4
">

{
orders.length === 0

?

<div className="
text-gray-500
text-center
py-10
">

No active deliveries

</div>

:

orders.slice(0,5).map(
(order:any)=>(

<div
key={order.id}
className="
border
rounded-lg
p-4
"
>

<div className="
flex
justify-between
mb-2
">

<h3 className="
font-bold
">

#
{
order.id
}

</h3>

<StatusBadge
status={order.status}
/>

</div>

<p className="
text-sm
text-gray-600
mb-2
">

{
order.fuelType
}

→

{
order.deliveryLocation
}

</p>

<div className="
flex
justify-between
text-xs
text-gray-500
">

<span>

{
order.quantity
}
L

</span>

<span>

ETA:
2h 15m

</span>

</div>

</div>

))
}

</div>

</div>

{/* Alerts */}

<div className="
bg-white
rounded-xl
border
p-6
">

<h2 className="
text-2xl
font-bold
mb-6
">

Live Alerts

</h2>

<div className="
space-y-4
">

{
liveAlerts.length === 0

?

<div className="
text-gray-500
text-center
py-10
">

No active alerts

</div>

:

liveAlerts.slice(0,6).map(
(alert:any)=>(

<div
key={alert.id}
className="
border-l-4
border-orange-500
bg-orange-50
p-4
rounded-r-lg
"
>

<h3 className="
font-semibold
text-gray-900
mb-1
">

{
alert.title
}

</h3>

<p className="
text-sm
text-gray-600
">

{
alert.message
}

</p>

<div className="
text-xs
text-gray-400
mt-2
">

{
new Date(
alert.createdAt
).toLocaleString()
}

</div>

</div>

))
}

</div>

</div>

</div>

</main>

</div>

</div>

);

}