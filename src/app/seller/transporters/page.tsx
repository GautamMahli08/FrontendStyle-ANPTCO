'use client';

import { useEffect,useState } from 'react';

import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';
import StatusBadge from '@/src/components/workflow/StatusBadge';
import ToggleSwitch from '@/src/components/ui/ToggleSwitch';

import {

getCurrentUser,
getSellerConnections,
getUsers,
getTrucks,
getOrders,
updateTruck,
updateSellerConnection,

} from '@/src/lib/demo-data';

export default function SellerTransportersPage(){

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [transporters,
setTransporters] =
useState<any[]>([]);

useEffect(()=>{

setMounted(true);

const currentUser =
getCurrentUser();

if(!currentUser) return;

setUser(
currentUser
);

loadTransporters(
currentUser
);

},[]);

const loadTransporters = (
currentSeller:any
)=>{

const connections =
getSellerConnections();

const users =
getUsers();

const trucks =
getTrucks();

const orders =
getOrders();

// ── Approved linked transporters ──

const approvedConnections =

connections.filter(
(c:any)=>

c.sellerId ===
currentSeller.id

&&

c.status ===
'APPROVED'
);

// ── Build transporter data ──

const transporterData =

approvedConnections.map(
(connection:any)=>{

const transporter =

users.find(
(u:any)=>

u.id ===
connection.transporterId
);

if(!transporter)
return null;

const transporterTrucks =

trucks.filter(
(t:any)=>

t.tspId ===
transporter.id
);

const activeTrucks =

transporterTrucks.filter(
(t:any)=>

!t.disabled

&&

!connection.disabled

&&

(

t.status ===
'ACTIVE'

||

t.status ===
'EN_ROUTE'

||

t.status ===
'IDLE'
)
);

const activeOrders =

orders.filter(
(o:any)=>

o.transportProviderId ===
transporter.id

&&

o.status !==
'COMPLETED'
);

return {

...transporter,

connectionId:
connection.id,

disabled:
connection.disabled === true,

connectedAt:
connection.approvedAt,

totalTrucks:
transporterTrucks.length,

activeTrucks:
activeTrucks.length,

activeOrders:
activeOrders.length,

fleet:
transporterTrucks,

};

}
).filter(Boolean);

setTransporters(
transporterData
);

};

// ── Enable / disable a whole transporter partnership ──

const toggleTransporter = (
transporter:any
)=>{

updateSellerConnection(
transporter.connectionId,
{ disabled: !transporter.disabled }
);

if(user) loadTransporters(user);

};

// ── Enable / disable a single truck ──

const toggleTruck = (
truck:any
)=>{

updateTruck(
truck.id,
{ disabled: !truck.disabled }
);

if(user) loadTransporters(user);

};

if(

!mounted

||

!user

||

user.role !==
'SELLER_MANAGER'

){

return null;

}

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

<main className="
p-8
max-w-7xl
">

{/* Header */}

<div className="mb-8">

<h1 className="
text-3xl
font-bold
text-gray-900
mb-2
">

Connected Transporters

</h1>

<p className="text-gray-600">

Manage approved transport partners linked to your fuel operations

</p>

</div>

{/* Stats */}

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

Connected Partners

</p>

<p className="
text-4xl
font-bold
text-blue-600
">

{
transporters.length
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

Fleet Size

</p>

<p className="
text-4xl
font-bold
text-green-600
">

{
transporters.reduce(
(sum:number,t:any)=>

sum + t.totalTrucks,

0
)
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

Operational Trucks

</p>

<p className="
text-4xl
font-bold
text-emerald-600
">

{
transporters.reduce(
(sum:number,t:any)=>

sum + t.activeTrucks,

0
)
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

Active Deliveries

</p>

<p className="
text-4xl
font-bold
text-orange-600
">

{
transporters.reduce(
(sum:number,t:any)=>

sum + t.activeOrders,

0
)
}

</p>

</div>

</div>

{/* Transporters */}

{
transporters.length === 0

?

<div className="
bg-white
rounded-xl
border
p-16
text-center
">

<div className="
text-6xl
mb-4
">

🚛

</div>

<h2 className="
text-2xl
font-bold
mb-2
">

No Connected Transporters

</h2>

<p className="
text-gray-500
">

Approved transporters will appear here after KYC approval.

</p>

</div>

:

<div className="
grid
lg:grid-cols-2
gap-6
">

{
transporters.map(
(transporter:any)=>(

<div
key={transporter.id}
className={`
bg-white
rounded-xl
border
p-6
hover:shadow-lg
transition-shadow
${
transporter.disabled
? 'border-red-200 bg-red-50/40'
: ''
}
`}
>

{/* Header */}

<div className="
flex
items-start
justify-between
mb-6
">

<div>

<h2 className="
text-2xl
font-bold
text-gray-900
mb-1
">

{
transporter.companyName
||
`${transporter.firstName} ${transporter.lastName}`
}

</h2>

<p className="
text-gray-500
">

{
transporter.email
}

</p>

</div>

<div className="
flex
items-center
gap-2.5
">

<span className={`
text-sm
font-semibold
${
transporter.disabled
? 'text-red-600'
: 'text-emerald-600'
}
`}>
{
transporter.disabled
? 'Disabled'
: 'Active'
}
</span>

<ToggleSwitch
enabled={!transporter.disabled}
onChange={()=>
toggleTransporter(transporter)
}
/>

</div>

</div>

{/* Metrics */}

<div className="
grid
grid-cols-3
gap-4
mb-6
">

<div className="
bg-blue-50
rounded-lg
p-4
text-center
">

<p className="
text-2xl
font-bold
text-blue-700
">

{
transporter.totalTrucks
}

</p>

<p className="
text-xs
text-blue-600
">

Fleet

</p>

</div>

<div className="
bg-green-50
rounded-lg
p-4
text-center
">

<p className="
text-2xl
font-bold
text-green-700
">

{
transporter.activeTrucks
}

</p>

<p className="
text-xs
text-green-600
">

Operational

</p>

</div>

<div className="
bg-orange-50
rounded-lg
p-4
text-center
">

<p className="
text-2xl
font-bold
text-orange-700
">

{
transporter.activeOrders
}

</p>

<p className="
text-xs
text-orange-600
">

Deliveries

</p>

</div>

</div>

{/* Fleet */}

<div className="mb-6">

<h3 className="
font-bold
text-gray-900
mb-3
">

Fleet Overview

</h3>

<div className="
space-y-3
max-h-48
overflow-y-auto
">

{
transporter.fleet.length === 0

?

<div className="
text-sm
text-gray-500
bg-gray-50
rounded-lg
p-4
">

No trucks registered

</div>

:

transporter.fleet.map(
(truck:any)=>(

<div
key={truck.id}
className={`
border
rounded-lg
p-3
${
truck.disabled
? 'border-red-200 bg-red-50/40'
: ''
}
`}
>

<div className="
flex
items-center
justify-between
mb-2
">

<div>

<p className="
font-semibold
">

{
truck.registrationNumber
}

</p>

<p className="
text-xs
text-gray-500
">

{
truck.truckType
}

</p>

</div>

{
truck.disabled
?
<span className="
inline-flex
items-center
px-3
py-1
rounded-full
text-xs
font-medium
bg-red-100
text-red-800
">
🚫 Disabled
</span>
:
<StatusBadge
status={truck.status}
/>
}

</div>

<div className="
grid
grid-cols-3
gap-2
text-xs
text-gray-500
">

<div>

Fuel:
{' '}

{
Math.round(
truck.fuelLevel || 75
)
}%

</div>

<div>

GPS:
{' '}

{
truck.sensorConfigured

?

'LIVE'

:

'PENDING'
}

</div>

<div>

QR:
{' '}

{
truck.qrCode

?

'ACTIVE'

:

'WAITING'
}

</div>

</div>

{/* Truck enable / disable toggle */}

<div className="
mt-3
pt-2
border-t
flex
items-center
justify-between
">

<span className="
text-xs
text-gray-400
">
{
transporter.disabled
? 'Transporter disabled'
: truck.disabled
? 'Truck disabled'
: 'Truck active'
}
</span>

<ToggleSwitch
size="sm"
enabled={!truck.disabled && !transporter.disabled}
disabled={transporter.disabled}
onChange={()=>
toggleTruck(truck)
}
/>

</div>

</div>

))
}

</div>

</div>

{/* Footer */}

<div className="
pt-4
border-t
flex
items-center
justify-between
text-sm
text-gray-500
">

<div>

Connected:
{' '}

{
transporter.connectedAt

?

new Date(
transporter.connectedAt
).toLocaleDateString()

:

'N/A'
}

</div>

<div className="
text-green-600
font-medium
">

✓ Verified Partner

</div>

</div>

</div>

))
}

</div>

}

</main>

</div>

</div>

);

}