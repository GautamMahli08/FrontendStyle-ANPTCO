'use client';

import { useState,useEffect } from 'react';
import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';

import {

getCurrentUser,
getDriverById,
getOrders,
getTrucks,

} from '@/src/lib/demo-data';

export default function DriverDashboard(){

const router =
useRouter();

const [mounted,setMounted] =
useState(false);

const [user,setUser] =
useState<any>(null);

const [driver,setDriver] =
useState<any>(null);

const [assignedTruck,
setAssignedTruck] =
useState<any>(null);

const [activeOrder,
setActiveOrder] =
useState<any>(null);

useEffect(()=>{

setMounted(true);

const current =
getCurrentUser();

if(

!current

||

current.role !==
'DRIVER'

){

router.push('/');

return;

}

setUser(current);

loadDashboard(current);

// ── Live Simulation ──

const interval =

setInterval(()=>{

setAssignedTruck(
(prev:any)=>{

if(!prev) return prev;

return {

...prev,

fuelLevel:
Math.max(

20,

(prev.fuelLevel || 82)
-
Math.random()*2

),

speed:
35 + Math.floor(
Math.random()*40
),

};

});

},5000);

return ()=>clearInterval(interval);

},[]);

const loadDashboard = (
currentUser:any
)=>{

const driverData =

getDriverById(
currentUser.id
);

setDriver(
driverData
);

if(!driverData) return;

const truck =

getTrucks().find(
(t:any)=>

t.id ===
driverData.assignedTruckId
);

setAssignedTruck(
truck
);

if(truck){

const order =

getOrders().find(
(o:any)=>

o.assignedTruckId ===
truck.id

&&

![
'COMPLETED',
'CANCELLED',
]
.includes(
o.status
)

);

setActiveOrder(
order
);

}

};

if(
!mounted
||
!user
)
return null;

const delivered =

getOrders().filter(
(o:any)=>

o.assignedDriverId ===
user.id

&&

o.status ===
'COMPLETED'
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

{/* HERO */}

<div className="
bg-gradient-to-r
from-green-600
to-teal-700
rounded-xl
p-8
mb-8
text-white
">

<h1 className="
text-3xl
font-bold
mb-2
">

Welcome,
{' '}
{user.firstName}
{' '}
🚛

</h1>

<p className="text-green-100">

Live driver operations dashboard

</p>

</div>

{/* STATS */}

<div className="
grid
md:grid-cols-4
gap-6
mb-8
">

<Card
title="Deliveries"
value={delivered.length}
/>

<Card
title="Truck"
value={
assignedTruck
?
'ACTIVE'
:
'NONE'
}
/>

<Card
title="Trip"
value={
activeOrder
?
'LIVE'
:
'NONE'
}
/>

<Card
title="QR"
value={
assignedTruck?.qrCode
?
'READY'
:
'PENDING'
}
/>

</div>

{/* DRIVER INFO */}

<section className="
bg-white
rounded-xl
p-6
border
mb-6
">

<h2 className="
font-bold
text-xl
mb-4
">

Driver Information 👤

</h2>

<div className="
grid
md:grid-cols-3
gap-4
">

<Info
label="Driver Name"
value={`${user.firstName} ${user.lastName}`}
/>

<Info
label="Phone"
value={driver?.phone}
/>

<Info
label="License"
value={driver?.licenseNumber}
/>

</div>

</section>

{/* ASSIGNED TRUCK */}

<section className="
bg-white
rounded-xl
p-6
border
mb-6
">

<h2 className="
font-bold
text-xl
mb-4
">

Assigned Truck 🚛

</h2>

{
assignedTruck

?

<div className="
grid
md:grid-cols-4
gap-4
">

<Info
label="Registration"
value={assignedTruck.registrationNumber}
/>

<Info
label="Capacity"
value={`${assignedTruck.capacity}L`}
/>

<Info
label="Truck Status"
value={assignedTruck.status}
/>

<Info
label="QR Status"
value={
assignedTruck.qrCode
?
'ACTIVE'
:
'PENDING'
}
/>

</div>

:

<p>
No truck assigned
</p>

}

</section>

{/* SENSOR TELEMETRY */}

<section className="
bg-white
rounded-xl
p-6
border
mb-6
">

<h2 className="
font-bold
text-xl
mb-4
">

Live Sensor Telemetry 📡

</h2>

{
assignedTruck

?

<div className="
grid
md:grid-cols-4
gap-4
">

<Info
label="Fuel Level"
value={`${Math.round(
assignedTruck.fuelLevel || 82
)}%`}
/>

<Info
label="GPS"
value="LIVE"
/>

<Info
label="Speed"
value={`${assignedTruck.speed || 42} km/h`}
/>

<Info
label="Temperature"
value="31°C"
/>

</div>

:

<p>
No active telemetry
</p>

}

</section>

{/* ACTIVE DELIVERY */}

<section className="
bg-white
rounded-xl
p-6
border
mb-6
">

<h2 className="
font-bold
text-xl
mb-4
">

Active Delivery 📦

</h2>

{
activeOrder

?

<>

<div className="
bg-green-50
border
border-green-200
rounded-lg
p-4
mb-6
">

<p className="
font-semibold
text-green-800
mb-1
">

🚛 Delivery In Progress

</p>

<p className="
text-sm
text-green-700
">

ETA:
1h 45m
•
Live GPS tracking active
•
Fuel monitoring enabled

</p>

</div>

<div className="
grid
md:grid-cols-3
gap-4
mb-6
">

<Info
label="Destination"
value={
activeOrder.deliveryLocation
}
/>

<Info
label="Volume"
value={`${activeOrder.quantity}L`}
/>

<div>

<p className="text-gray-500">
Status
</p>

<StatusBadge
status={activeOrder.status}
/>

</div>

</div>

<div className="
grid
grid-cols-2
md:grid-cols-4
gap-3
">

<button
onClick={()=>
router.push('/driver/map')
}
className="
bg-blue-600
hover:bg-blue-700
text-white
rounded-lg
py-3
font-medium
"
>

📍 Live Map

</button>

<button
className="
bg-green-600
hover:bg-green-700
text-white
rounded-lg
py-3
font-medium
"
>

🚚 Start Trip

</button>

<button
className="
bg-orange-600
hover:bg-orange-700
text-white
rounded-lg
py-3
font-medium
"
>

⬇️ Offloading

</button>

<button
className="
bg-purple-600
hover:bg-purple-700
text-white
rounded-lg
py-3
font-medium
"
>

✅ Complete

</button>

</div>

</>

:

<p>
No active delivery
</p>

}

</section>

{/* LIVE ALERTS */}

<section className="
bg-white
rounded-xl
p-6
border
">

<h2 className="
font-bold
text-xl
mb-4
">

Live Alerts 🚨

</h2>

<div className="
space-y-3
">

<div className="
bg-yellow-50
border-l-4
border-yellow-500
p-4
rounded-r-lg
">

<p className="
font-semibold
text-yellow-800
">

⚠️ Fuel Drop Detected

</p>

<p className="
text-sm
text-yellow-700
">

Truck fuel level dropped by 4% in last 30 mins

</p>

</div>

<div className="
bg-blue-50
border-l-4
border-blue-500
p-4
rounded-r-lg
">

<p className="
font-semibold
text-blue-800
">

📍 GPS Tracking Active

</p>

<p className="
text-sm
text-blue-700
">

Live route tracking synced successfully

</p>

</div>

<div className="
bg-red-50
border-l-4
border-red-500
p-4
rounded-r-lg
">

<p className="
font-semibold
text-red-800
">

🛢️ Fuel Monitoring Enabled

</p>

<p className="
text-sm
text-red-700
">

No tampering detected • Sensor operating normally

</p>

</div>

</div>

</section>

</main>

</div>

</div>

);

}

function Card({

title,
value,

}:any){

return(

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-gray-500
mb-2
">

{title}

</p>

<p className="
text-3xl
font-bold
">

{value}

</p>

</div>

);

}

function Info({

label,
value,

}:any){

return(

<div>

<p className="text-gray-500">

{label}

</p>

<p className="font-bold">

{value || '-'}

</p>

</div>

);

}