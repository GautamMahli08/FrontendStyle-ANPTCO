'use client';

import { useState, useEffect } from 'react';

import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';

import QRCode from 'qrcode';

import {

getCurrentUser,
getSensorRequests,
updateSensorRequest,
updateTruck,
getTrucks,
addNotification,

} from '@/src/lib/demo-data';
import { assignDevice } from '@/src/lib/device-assignment';

const PENDING_STATUSES = [
'PENDING_ADMIN_APPROVAL'
];

const APPROVED_STATUSES = [
'ADMIN_APPROVED'
];

const REJECTED_STATUSES = [
'ADMIN_REJECTED'
];

export default function AdminSensorIntegrationPage(){

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

const [generatingQR,
setGeneratingQR] =
useState(false);

useEffect(()=>{

setMounted(true);

const currentUser =
getCurrentUser();

setUser(
currentUser
);

if(currentUser){

loadRequests();

}

},[]);

const loadRequests = ()=>{

const allRequests =
getSensorRequests();

setRequests(
allRequests
);

};

const generateQRCodeData = async (
truckId:string
)=>{

try{

const qrData =
JSON.stringify({

truckId,

timestamp:
Date.now(),

platform:
'FuelManagement',

});

return await QRCode.toDataURL(

qrData,

{

width:300,

margin:2,

color:{

dark:'#000000',

light:'#FFFFFF',

},

}

);

}
catch(error){

console.error(
'QR Error:',
error
);

return null;

}

};

const handleApproveIntegration = async (
requestId:string
)=>{

setGeneratingQR(true);

try{

const request =

requests.find(
r=>r.id===requestId
);

if(!request){

alert(
'❌ Request not found'
);

return;

}

const qrCode =

await generateQRCodeData(
request.truckId
);

if(!qrCode){

alert(
'❌ Failed to generate QR code'
);

return;

}

const deviceId =

`GSKY-${Math.floor(
100000 + Math.random()*900000
)}`;

// ── Update Truck ──

updateTruck(

request.truckId,

{

qrCode,

qrCodeId:
qrCode,

qrCodeUrl:
qrCode,

galileoskyDeviceId:
deviceId,

status:'ACTIVE',

sensorConfigured:true,

sensorIntegrationComplete:true,

commercialApproval:true,

safetyApproval:true,

activatedAt:
new Date(),

}

);

// Time-versioned device↔truck record (plan §1) — append-only, so a device
// that later moves to another truck never overwrites this truck's history.
assignDevice(request.truckId, deviceId, 'GPS');

// ── Update Sensor Request ──

updateSensorRequest(

requestId,

{

status:
'ADMIN_APPROVED',

adminApproved:true,

adminReviewedAt:
new Date(),

sensorIntegrationComplete:true,

activatedAt:
new Date(),

}

);

// ── Notify Transporter ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
request.transporterId,

type:
'SENSOR_APPROVED',

title:
'✅ Sensor Integration Approved',

message:
`Truck ${request.truckRegistration} is now ACTIVE and live tracking is enabled.`,

read:false,

createdAt:
new Date(),

});

const truckAfter =

getTrucks().find(
t=>t.id===request.truckId
);

if(
truckAfter?.status ===
'ACTIVE'
){

alert(

`✅ SUCCESS!

Truck:
${request.truckRegistration}

QR Code:
Generated

Device:
${deviceId}

Truck is now ACTIVE and live tracking is enabled.`

);

}

loadRequests();

setShowModal(false);

setSelectedRequest(null);

}
catch(error){

alert(
'❌ Error approving integration'
);

console.error(error);

}
finally{

setGeneratingQR(false);

}

};

const handleRejectIntegration = (
requestId:string
)=>{

const reason =
prompt(
'Reason for rejection:'
);

if(!reason) return;

const request =

requests.find(
r=>r.id===requestId
);

if(!request) return;

updateSensorRequest(

requestId,

{

status:
'ADMIN_REJECTED',

adminReviewedAt:
new Date(),

adminNotes:
reason,

}

);

addNotification({

id:
`notif-${Date.now()}`,

userId:
request.transporterId,

type:
'SENSOR_REJECTED',

title:
'❌ Sensor Integration Rejected',

message:
`Truck ${request.truckRegistration} integration rejected: ${reason}`,

read:false,

createdAt:
new Date(),

});

alert(
'❌ Integration request rejected'
);

loadRequests();

setShowModal(false);

setSelectedRequest(null);

};

if(

!mounted

||

!user

||

user.role !==
'PLATFORM_ADMIN'

){

return null;

}

const pendingRequests =

requests.filter(
r=>
PENDING_STATUSES.includes(
r.status
)
);

const approvedRequests =

requests.filter(
r=>
APPROVED_STATUSES.includes(
r.status
)
);

const rejectedRequests =

requests.filter(
r=>
REJECTED_STATUSES.includes(
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

Sensor Integration 📡

</h1>

<p className="text-gray-600">

Final platform approval for seller-approved sensor integrations

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
">

{
requests.length
}

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

Pending

</p>

<p className="
text-3xl
font-bold
text-orange-600
">

{
pendingRequests.length
}

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

Approved

</p>

<p className="
text-3xl
font-bold
text-green-600
">

{
approvedRequests.length
}

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

Rejected

</p>

<p className="
text-3xl
font-bold
text-red-600
">

{
rejectedRequests.length
}

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

Pending Integration Requests

</h2>

<div className="
grid
md:grid-cols-2
gap-6
">

{
pendingRequests.map(
(request:any)=>(

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
justify-between
mb-4
">

<div>

<h3 className="
text-lg
font-bold
">

{
request.truckRegistration
}

</h3>

<p className="
text-sm
text-gray-500
">

{
request.transporterName
}

</p>

</div>

<span className="
px-3
py-1
bg-orange-100
text-orange-700
text-xs
font-semibold
rounded-full
">

Pending

</span>

</div>

<button
onClick={()=>{

setSelectedRequest(
request
);

setShowModal(true);

}}
className="
w-full
bg-blue-600
hover:bg-blue-700
text-white
font-medium
py-2
rounded-lg
"
>

📡 Review & Integrate

</button>

</div>

))
}

</div>

</div>
}

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
max-w-2xl
w-full
">

<h2 className="
text-2xl
font-bold
mb-6
">

Sensor Integration Review

</h2>

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
text-xs
text-gray-500
uppercase
mb-1
">

Transport Provider

</p>

<p className="
font-semibold
text-lg
">

{
selectedRequest.transporterName
}

</p>

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p>
<strong>
Truck:
</strong>

{' '}

{
selectedRequest.truckRegistration
}

</p>

<p>
<strong>
Truck ID:
</strong>

{' '}

{
selectedRequest.truckId
}

</p>

</div>

</div>

<div className="
flex
gap-3
">

<button
onClick={()=>
handleApproveIntegration(
selectedRequest.id
)
}
disabled={generatingQR}
className="
flex-1
bg-green-600
hover:bg-green-700
text-white
font-medium
py-3
rounded-lg
"
>

{
generatingQR

?

'⏳ Generating QR...'

:

'✓ Approve & Generate QR'
}

</button>

<button
onClick={()=>
handleRejectIntegration(
selectedRequest.id
)
}
disabled={generatingQR}
className="
flex-1
bg-red-600
hover:bg-red-700
text-white
font-medium
py-3
rounded-lg
"
>

✕ Reject

</button>

</div>

</div>

</div>

}

</main>

</div>

</div>

);

}