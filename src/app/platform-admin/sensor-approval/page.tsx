'use client';

import { useEffect,useState } from 'react';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import {

getCurrentUser,

getSensorRequests,

updateSensorRequest,

updateTruck,

addNotification,

} from '@/src/lib/demo-data';

export default function SensorApprovalPage(){

const [user,setUser] =
useState<any>(null);

const [requests,setRequests] =
useState<any[]>([]);

useEffect(()=>{

const current =
getCurrentUser();

setUser(
current
);

load();

},[]);

const load = ()=>{

const all =
getSensorRequests();

setRequests(

all.filter(
(r:any)=>

r.status ===
'PENDING_ADMIN_APPROVAL'
)

);

};

const generateQRCode = (
truckId:string
)=>{

return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${truckId}`;

};

const review = (

request:any,

approved:boolean

)=>{

const qrCode =

approved

?

generateQRCode(
request.truckId
)

:

undefined;

// ── Update Sensor Request ──

updateSensorRequest(

request.id,

{

status:

approved

?

'ADMIN_APPROVED'

:

'ADMIN_REJECTED',

adminApproved:
approved,

adminReviewedBy:
user.id,

adminReviewedAt:
new Date(),

sensorIntegrationComplete:
approved,

activatedAt:

approved

?

new Date()

:

undefined,

qrGenerated:
approved,

qrGeneratedAt:

approved

?

new Date()

:

undefined,

}

);

// ── Update Truck ──

if(approved){

updateTruck(

request.truckId,

{

sensorConfigured:true,

qrCode:
qrCode,

qrCodeUrl:
qrCode,

status:
'IDLE',

commercialApproval:true,

safetyApproval:true,

sensorIntegrationComplete:true,

}

);

}
else{

updateTruck(

request.truckId,

{

status:
'ADMIN_REJECTED'

}

);

}

// ── Notify Transporter ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
request.transporterId,

type:

approved

?

'SENSOR_ACTIVATED'

:

'SENSOR_REJECTED',

title:

approved

?

'✅ Sensor Integration Activated'

:

'❌ Sensor Integration Rejected',

message:

approved

?

`${request.truckRegistration} sensor integration is now active and QR code has been generated.`

:

`${request.truckRegistration} sensor integration was rejected by Platform Admin.`,

read:false,

createdAt:
new Date(),

});

// ── Notify Seller ──

addNotification({

id:
`notif-${Date.now()}-seller`,

userId:
request.sellerId,

type:

approved

?

'SENSOR_ACTIVATED'

:

'SENSOR_REJECTED',

title:

approved

?

'✅ Truck Activated'

:

'❌ Truck Rejected',

message:

approved

?

`${request.truckRegistration} sensor integration completed successfully.`

:

`${request.truckRegistration} was rejected by Platform Admin.`,

read:false,

createdAt:
new Date(),

});

alert(

approved

?

'✅ Sensor integration activated successfully!'

:

'❌ Sensor request rejected.'

);

load();

};

if(!user)
return null;

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

<div className="
bg-white
rounded-xl
border
p-8
mb-8
">

<h1 className="
text-3xl
font-bold
mb-2
">

Platform Sensor Activation ⚙️

</h1>

<p className="
text-gray-600
">

Seller approved integrations waiting for final activation

</p>

</div>

<div className="
grid
grid-cols-3
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
text-gray-500
text-sm
mb-1
">

Pending Activation

</p>

<p className="
text-3xl
font-bold
text-orange-600
">

{
requests.length
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
text-gray-500
text-sm
mb-1
">

QR Generation

</p>

<p className="
text-3xl
font-bold
text-blue-600
">

AUTO

</p>

</div>

<div className="
bg-white
rounded-xl
border
p-6
">

<p className="
text-gray-500
text-sm
mb-1
">

Sensor Activation

</p>

<p className="
text-3xl
font-bold
text-green-600
">

LIVE

</p>

</div>

</div>

<div className="
space-y-4
">

{
requests.length === 0

?

<div className="
bg-white
rounded-xl
border
p-12
text-center
text-gray-500
">

✅ No pending admin approvals

</div>

:

requests.map(
(req:any)=>(

<div
key={req.id}
className="
bg-white
border
rounded-xl
p-6
"
>

<div className="
grid
md:grid-cols-5
gap-4
mb-6
">

<div>

<p className="
text-gray-500
text-sm
">

Seller

</p>

<p className="
font-bold
">

{
req.sellerName
}

</p>

</div>

<div>

<p className="
text-gray-500
text-sm
">

Truck

</p>

<p className="
font-bold
">

{
req.truckRegistration
}

</p>

</div>

<div>

<p className="
text-gray-500
text-sm
">

Transporter

</p>

<p className="
font-bold
">

{
req.transporterName
}

</p>

</div>

<div>

<p className="
text-gray-500
text-sm
">

Compartments

</p>

<p className="
font-bold
">

{
req.compartments?.length || 0
}

</p>

</div>

<div>

<p className="
text-gray-500
text-sm
">

Status

</p>

<p className="
font-bold
text-orange-600
">

Pending Admin Approval

</p>

</div>

</div>

<div className="
bg-blue-50
border
border-blue-100
rounded-lg
p-4
mb-5
">

<p className="
text-sm
text-blue-800
font-medium
mb-2
">

⚙️ Activation Includes

</p>

<ul className="
text-sm
text-blue-700
space-y-1
">

<li>
• QR code generation
</li>

<li>
• Sensor activation
</li>

<li>
• Live tracking enablement
</li>

<li>
• Fuel monitoring activation
</li>

<li>
• Truck operational approval
</li>

</ul>

</div>

<div className="
flex
gap-3
">

<button
onClick={()=>
review(
req,
true
)
}
className="
bg-green-600
hover:bg-green-700
text-white
px-6
py-3
rounded-lg
font-semibold
"
>

✓ Activate Sensor

</button>

<button
onClick={()=>
review(
req,
false
)
}
className="
bg-red-600
hover:bg-red-700
text-white
px-6
py-3
rounded-lg
font-semibold
"
>

✕ Reject

</button>

</div>

</div>

))
}

</div>

</main>

</div>

</div>

);

}