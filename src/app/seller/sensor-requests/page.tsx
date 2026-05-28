'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import StatusBadge from '@/src/components/workflow/StatusBadge';

import {

getCurrentUser,

getSensorRequests,

updateSensorRequest,

updateTruck,

addNotification,

getUsers,

} from '@/src/lib/demo-data';

export default function SensorRequestsPage() {

const router = useRouter();

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [requests,setRequests] =
useState<any[]>([]);

const [selectedRequest,
setSelectedRequest] =
useState<any>(null);

const [showModal,
setShowModal] =
useState(false);

const [action,
setAction] =
useState<'forward'|'reject'>(
'forward'
);

const [notes,
setNotes] =
useState('');

useEffect(()=>{

setMounted(true);

const currentUser =
getCurrentUser();

if(!currentUser){

router.push('/');

return;

}

setUser(
currentUser
);

loadRequests(
currentUser
);

},[router]);

const loadRequests = (
currentUser?:any
)=>{

const seller =
currentUser ||
getCurrentUser();

const allRequests =
getSensorRequests();

const sellerRequests =

allRequests.filter(
(r:any)=>

r.sellerId ===
seller?.id
);

setRequests(
sellerRequests
);

};

const openModal = (

request:any,

actionType:
'forward'|'reject'

)=>{

setSelectedRequest(
request
);

setAction(
actionType
);

setNotes('');

setShowModal(true);

};

const handleSubmit = ()=>{

if(
!selectedRequest
||
!user
) return;

if(
action ===
'forward'
){

// ── Update Sensor Request ──

updateSensorRequest(

selectedRequest.id,

{

status:
'PENDING_ADMIN_APPROVAL',

managerReviewedAt:
new Date(),

managerReviewedBy:
user.id,

managerNotes:

notes ||

'Seller approved and forwarded to Admin',

forwardedToAdminAt:
new Date(),

}

);

// ── Update Truck Status ──

updateTruck(

selectedRequest.truckId,

{

status:
'PENDING_ADMIN_APPROVAL'

}

);

// ── Notify Admins ──

const users =
getUsers();

const admins =

users.filter(
(u:any)=>

u.role ===
'PLATFORM_ADMIN'
);

admins.forEach(
(admin:any)=>{

addNotification({

id:
`notif-${Date.now()}-${Math.random()}`,

userId:
admin.id,

type:
'SENSOR_REQUEST_FORWARDED',

title:
'🔧 Seller Approved Sensor Request',

message:
`${selectedRequest.truckRegistration} is ready for final sensor integration approval.`,

read:false,

createdAt:
new Date(),

});

}
);

// ── Notify Transporter ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
selectedRequest.transporterId,

type:
'REQUEST_FORWARDED',

title:
'✅ Seller Approved Request',

message:
`Your truck ${selectedRequest.truckRegistration} was approved by seller and forwarded to Admin.`,

read:false,

createdAt:
new Date(),

});

alert(
'✅ Request forwarded to Platform Admin.'
);

}
else{

// ── Reject Sensor Request ──

updateSensorRequest(

selectedRequest.id,

{

status:
'SELLER_REJECTED',

managerReviewedAt:
new Date(),

managerReviewedBy:
user.id,

managerNotes:

notes ||

'Seller rejected request',

}

);

// ── Reject Truck ──

updateTruck(

selectedRequest.truckId,

{

status:
'SELLER_REJECTED'

}

);

// ── Notify Transporter ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
selectedRequest.transporterId,

type:
'REQUEST_REJECTED',

title:
'❌ Seller Rejected Request',

message:
`Seller rejected sensor request for ${selectedRequest.truckRegistration}.`,

read:false,

createdAt:
new Date(),

});

alert(
'❌ Request rejected.'
);

}

setShowModal(false);

loadRequests(user);

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

const pendingRequests =

requests.filter(
r=>

r.status ===
'PENDING_SELLER_APPROVAL'
);

const forwardedRequests =

requests.filter(
r=>

r.status ===
'PENDING_ADMIN_APPROVAL'
);

const completedRequests =

requests.filter(
r=>

[
'COMPLETED',

'ADMIN_APPROVED',

'ADMIN_REJECTED',

'SELLER_REJECTED'

].includes(
r.status
)
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

<div className="mb-8">

<h1 className="
text-3xl
font-bold
text-gray-900
mb-2
">

Sensor Integration Requests

</h1>

<p className="text-gray-600">

Review transporter requests and forward approved requests to Platform Admin

</p>

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

Total Requests

</p>

<p className="
text-3xl
font-bold
text-gray-900
">

{requests.length}

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

Pending Review

</p>

<p className="
text-3xl
font-bold
text-orange-600
">

{pendingRequests.length}

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

Forwarded to Admin

</p>

<p className="
text-3xl
font-bold
text-blue-600
">

{forwardedRequests.length}

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

Completed

</p>

<p className="
text-3xl
font-bold
text-green-600
">

{completedRequests.length}

</p>

</div>

</div>

{
pendingRequests.length > 0
&&

<div className="mb-8">

<h2 className="
text-2xl
font-bold
mb-4
">

Pending Seller Review
(
{pendingRequests.length}
)

</h2>

<div className="space-y-4">

{
pendingRequests.map(
(request)=>(
<div
key={request.id}
className="
bg-white
rounded-xl
p-6
border-2
border-orange-200
"
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
font-semibold
text-gray-900
mb-1
">

🚛
{' '}
{request.truckRegistration}

</h3>

<p className="
text-sm
text-gray-600
">

Transporter:
{' '}
{request.transporterName}

</p>

<p className="
text-sm
text-gray-600
mt-1
">

Seller Code:
{' '}

<strong>
{request.sellerCode}
</strong>

</p>

<p className="
text-sm
text-gray-600
">

Compartments:
{' '}
{
request.compartments?.length || 0
}

</p>

<p className="
text-sm
text-gray-600
">

Requested:
{' '}

{
new Date(
request.requestedAt
).toLocaleString()
}

</p>

</div>

<StatusBadge
status={request.status}
/>

</div>

<div className="
flex
gap-3
mt-4
">

<button
onClick={()=>
openModal(
request,
'forward'
)
}
className="
flex-1
bg-blue-600
hover:bg-blue-700
text-white
font-medium
py-2
rounded-lg
"
>

✓ Forward to Admin

</button>

<button
onClick={()=>
openModal(
request,
'reject'
)
}
className="
flex-1
bg-red-600
hover:bg-red-700
text-white
font-medium
py-2
rounded-lg
"
>

✕ Reject

</button>

</div>

</div>
))
}

</div>

</div>
}

{
forwardedRequests.length > 0
&&

<div className="mb-8">

<h2 className="
text-2xl
font-bold
mb-4
">

Forwarded to Admin

</h2>

<div className="space-y-3">

{
forwardedRequests.map(
(request)=>(
<div
key={request.id}
className="
bg-white
rounded-lg
p-4
border
"
>

<div className="
flex
items-center
justify-between
">

<div>

<p className="font-semibold">

{
request.truckRegistration
}

</p>

<p className="
text-sm
text-gray-600
">

{
request.transporterName
}

</p>

</div>

<StatusBadge
status={request.status}
/>

</div>

</div>
))
}

</div>

</div>
}

{
completedRequests.length > 0
&&

<div className="mb-8">

<h2 className="
text-2xl
font-bold
mb-4
">

Completed Requests

</h2>

<div className="space-y-3">

{
completedRequests.map(
(request)=>(
<div
key={request.id}
className="
bg-white
rounded-lg
p-4
border
"
>

<div className="
flex
items-center
justify-between
">

<div>

<p className="font-semibold">

{
request.truckRegistration
}

</p>

<p className="
text-sm
text-gray-600
">

{
request.transporterName
}

</p>

</div>

<StatusBadge
status={request.status}
/>

</div>

</div>
))
}

</div>

</div>
}

{
requests.length === 0
&&

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

🎫

</span>

<h3 className="
text-xl
font-semibold
text-gray-900
mb-2
">

No Requests Yet

</h3>

<p className="text-gray-600">

Sensor integration requests will appear here

</p>

</div>
}

</main>

</div>

{
showModal
&&
selectedRequest
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
max-w-lg
w-full
">

<h3 className="
text-2xl
font-bold
mb-4
">

{
action ===
'forward'

?

'✓ Forward to Admin'

:

'✕ Reject Request'

}

</h3>

<textarea
value={notes}
onChange={(e)=>
setNotes(
e.target.value
)
}
rows={4}
className="
w-full
px-4
py-2
border
border-gray-300
rounded-lg
mb-4
"
placeholder="Add notes..."
/>

<div className="
flex
gap-3
">

<button
onClick={handleSubmit}
className={`
flex-1
font-medium
py-2
rounded-lg
text-white

${
action ===
'forward'

?

'bg-blue-600 hover:bg-blue-700'

:

'bg-red-600 hover:bg-red-700'
}
`}
>

{
action ===
'forward'

?

'✓ Forward'

:

'✕ Reject'

}

</button>

<button
onClick={()=>
setShowModal(false)
}
className="
px-6
bg-gray-200
hover:bg-gray-300
text-gray-700
font-medium
py-2
rounded-lg
"
>

Cancel

</button>

</div>

</div>

</div>
}

</div>

);

}