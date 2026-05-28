'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import StatusBadge from '@/src/components/workflow/StatusBadge';

import {

getCurrentUser,

getTrucks,

} from '@/src/lib/demo-data';

export default function TransportTrucksPage() {

const router = useRouter();

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [trucks,setTrucks] =
useState<any[]>([]);

const [selectedTruck,
setSelectedTruck] =
useState<any>(null);

const [showModal,
setShowModal] =
useState(false);

useEffect(()=>{

setMounted(true);

const currentUser =
getCurrentUser();

if(
!currentUser
||
currentUser.role !==
'TRANSPORT_ADMIN'
){

router.push('/');

return;

}

setUser(
currentUser
);

loadTrucks(
currentUser
);

},[router]);

useEffect(()=>{

if(!user) return;

const interval = setInterval(()=>{

loadTrucks(user);

},3000);

return ()=>clearInterval(interval);

},[user]);

const loadTrucks = (
currentUser:any
)=>{

const allTrucks =
getTrucks();

const myTrucks =

allTrucks.filter(
(t:any)=>

t.tspId ===
currentUser.id
);

setTrucks(
myTrucks
);

};

const handleRefresh = ()=>{

if(user){

loadTrucks(user);

alert(
'✅ Trucks refreshed!'
);

}

};

if(!mounted) return null;

if(
!user
||
user.role !==
'TRANSPORT_ADMIN'
){

return null;

}

const totalTrucks =
trucks.length;

const idleTrucks =

trucks.filter(
t=>

t.status ===
'IDLE'
).length;

const activeTrucks =

trucks.filter(
t=>

[
'EN_ROUTE',

'ASSIGNED'

].includes(
t.status
)
).length;

const pendingTrucks =

trucks.filter(
t=>

[
'PENDING_SELLER_APPROVAL',

'PENDING_ADMIN_APPROVAL'

].includes(
t.status
)
).length;

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

<div className="
mb-8
flex
items-center
justify-between
">

<div>

<h1 className="
text-3xl
font-bold
text-gray-900
mb-2
">

My Trucks 🚛

</h1>

<p className="text-gray-600">

Manage your transporter fleet

</p>

</div>

<div className="flex gap-3">

<button
onClick={handleRefresh}
className="
bg-blue-100
hover:bg-blue-200
text-blue-700
font-medium
px-4
py-2
rounded-lg
"
>

🔄 Refresh

</button>

<button
onClick={()=>
router.push(
'/transport/trucks/register'
)
}
className="
bg-blue-600
hover:bg-blue-700
text-white
font-semibold
px-6
py-2
rounded-lg
"
>

+ Register New Truck

</button>

</div>

</div>

<div className="
grid
grid-cols-4
gap-6
mb-8
">

<div className="
bg-white
rounded-lg
p-6
border
">

<p className="
text-sm
text-gray-600
mb-1
">

Total Trucks

</p>

<p className="
text-3xl
font-bold
text-gray-900
">

{totalTrucks}

</p>

</div>

<div className="
bg-white
rounded-lg
p-6
border
">

<p className="
text-sm
text-gray-600
mb-1
">

Idle

</p>

<p className="
text-3xl
font-bold
text-green-600
">

{idleTrucks}

</p>

</div>

<div className="
bg-white
rounded-lg
p-6
border
">

<p className="
text-sm
text-gray-600
mb-1
">

Active

</p>

<p className="
text-3xl
font-bold
text-blue-600
">

{activeTrucks}

</p>

</div>

<div className="
bg-white
rounded-lg
p-6
border
">

<p className="
text-sm
text-gray-600
mb-1
">

Pending Approval

</p>

<p className="
text-3xl
font-bold
text-orange-600
">

{pendingTrucks}

</p>

</div>

</div>

{
pendingTrucks > 0
&&

<div className="
bg-orange-50
rounded-lg
p-4
mb-6
border
border-orange-200
">

<p className="
text-orange-800
font-medium
">

⚠️
{' '}
{pendingTrucks}
{' '}
truck(s) waiting for seller/admin approval before QR activation.

</p>

</div>
}

{
trucks.length > 0

?

<div className="
grid
md:grid-cols-2
lg:grid-cols-3
gap-6
">

{
trucks.map(
(truck:any)=>(

<div
key={truck.id}
className="
bg-white
rounded-xl
p-6
border-2
border-gray-200
hover:border-blue-300
transition-all
cursor-pointer
"
onClick={()=>{

setSelectedTruck(
truck
);

setShowModal(true);

}}
>

<div className="
flex
items-start
justify-between
mb-4
">

<div>

<h3 className="
text-lg
font-bold
text-gray-900
mb-1
">

{
truck.registrationNumber
}

</h3>

<p className="
text-xs
text-gray-500
">

Seller:
{' '}

{
truck.sellerName
||
'Pending'
}

</p>

</div>

<StatusBadge
status={truck.status}
/>

</div>

<div className="
space-y-2
text-sm
mb-4
">

<p className="text-gray-600">

📦
{' '}
{
truck.compartments?.length || 0
}
{' '}
Compartments

</p>

<p className="text-gray-600">

💧 Capacity:
{' '}

{
truck.capacity?.toLocaleString()
||
0
}
L

</p>

</div>

{
truck.qrCode

?

<div className="
bg-green-50
rounded-lg
p-3
border
border-green-200
">

<p className="
text-xs
text-green-800
font-medium
">

✓ QR Code Generated

</p>

<p className="
text-xs
text-green-700
">

Truck ready for deliveries

</p>

</div>

:

<div className="
bg-orange-50
rounded-lg
p-3
border
border-orange-200
">

<p className="
text-xs
text-orange-800
font-medium
">

⏳ Approval Pending

</p>

<p className="
text-xs
text-orange-700
">

Waiting for seller/admin approval before QR activation

</p>

</div>

}

</div>

))
}

</div>

:

<div className="
bg-white
rounded-xl
p-12
text-center
border
">

<span className="
text-6xl
mb-4
block
">

🚛

</span>

<h3 className="
text-xl
font-semibold
text-gray-900
mb-2
">

No Trucks Registered

</h3>

<p className="
text-gray-600
mb-6
">

Register your first truck

</p>

<button
onClick={()=>
router.push(
'/transport/trucks/register'
)
}
className="
bg-blue-600
hover:bg-blue-700
text-white
font-semibold
px-6
py-3
rounded-lg
"
>

+ Register Truck

</button>

</div>
}

</main>

</div>

{
showModal
&&
selectedTruck
&&

<div className="
fixed
inset-0
bg-black
bg-opacity-50
flex
items-center
justify-center
z-50
p-4
">

<div className="
bg-white
rounded-xl
p-6
max-w-2xl
w-full
max-h-[90vh]
overflow-y-auto
">

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
selectedTruck.registrationNumber
}

</h2>

<p className="
text-sm
text-gray-600
">

Truck ID:
{' '}
{
selectedTruck.id
}

</p>

</div>

<button
onClick={()=>
setShowModal(false)
}
className="
text-gray-500
hover:text-gray-700
text-2xl
"
>

✕

</button>

</div>

<div className="
space-y-4
mb-6
">

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-sm
text-gray-600
mb-2
">

Status

</p>

<StatusBadge
status={selectedTruck.status}
/>

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-sm
text-gray-600
mb-2
">

Compartments
(
{
selectedTruck.compartments?.length || 0
}
)

</p>

{
selectedTruck.compartments
&&

selectedTruck.compartments.length > 0

?

<div className="
space-y-2
">

{
selectedTruck.compartments.map(
(comp:any)=>(

<div
key={comp.id}
className="
flex
items-center
justify-between
bg-white
p-2
rounded
"
>

<span className="
text-sm
font-medium
">

Compartment
{' '}
{comp.id}

</span>

<span className="
text-sm
text-gray-600
">

{
comp.capacity?.toLocaleString()
}
L
•
{' '}
{
comp.fuelType
}

</span>

</div>

))
}

</div>

:

<p className="
text-sm
text-gray-500
">

No compartments configured

</p>

}

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-sm
text-gray-600
mb-2
">

Total Capacity

</p>

<p className="
text-2xl
font-bold
text-blue-600
">

{
selectedTruck.capacity?.toLocaleString()
||
0
}
L

</p>

</div>

{
selectedTruck.qrCode

?

<div className="
bg-green-50
rounded-lg
p-4
border
border-green-200
">

<p className="
text-sm
text-green-800
font-medium
mb-2
">

✓ QR Code Generated

</p>

<img
src={selectedTruck.qrCode}
alt="QR"
className="
w-48
h-48
mx-auto
mt-3
border-2
border-green-300
rounded-lg
"
/>

</div>

:

<div className="
bg-orange-50
rounded-lg
p-4
border
border-orange-200
">

<p className="
text-sm
text-orange-800
font-medium
mb-2
">

⏳ Approval Workflow Active

</p>

<p className="
text-xs
text-orange-700
">

Sensor integration request is under seller/admin approval workflow.

QR code will be generated after final platform approval.

</p>

</div>

}

</div>

<button
onClick={()=>
setShowModal(false)
}
className="
w-full
bg-gray-200
hover:bg-gray-300
text-gray-700
font-medium
py-3
rounded-lg
"
>

Close

</button>

</div>

</div>
}

</div>

);

}