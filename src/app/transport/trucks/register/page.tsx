'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import {

getCurrentUser,

addTruck,

addSensorRequest,

addNotification,

} from '@/src/lib/demo-data';

import type {
SensorIntegrationRequest
} from '@/src/types';

export default function RegisterTruckPage() {

const router = useRouter();

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [loading,setLoading] =
useState(false);

const [
registrationNumber,
setRegistrationNumber
] = useState('');

const [
compartments,
setCompartments
] = useState([
{
id:1,
capacity:'',
fuelType:'DIESEL',
},
]);

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

setUser(currentUser);

},[router]);

const addCompartment = ()=>{

setCompartments([
...compartments,
{
id:
compartments.length+1,
capacity:'',
fuelType:'DIESEL',
},
]);

};

const removeCompartment = (
id:number
)=>{

if(
compartments.length > 1
){

setCompartments(

compartments.filter(
c=>c.id!==id
)

);

}

};

const updateCompartment = (

id:number,

field:string,

value:any

)=>{

setCompartments(

compartments.map(
c=>

c.id===id

?

{
...c,
[field]:value
}

:

c
)

);

};

const handleSubmit = async (
e:React.FormEvent
)=>{

e.preventDefault();

setLoading(true);

try{

const validCompartments =

compartments.filter(
c=>

c.capacity

&&

parseFloat(
c.capacity
)>0
);

if(
validCompartments.length===0
){

alert(
'❌ Add at least one valid compartment'
);

setLoading(false);

return;

}

const totalCapacity =

validCompartments.reduce(

(sum,c)=>

sum +

parseFloat(
c.capacity
),

0

);

// ── Approved Seller Connection ──

const sellerConnections =

JSON.parse(

localStorage.getItem(
'fuel_seller_connections'
)

||

'[]'

);

const approvedConnection =

sellerConnections.find(
(c:any)=>

c.transporterId ===
user.id

&&

(
c.status === 'APPROVED'

||

c.approved === true
)
);

if(!approvedConnection){

alert(

'❌ No approved seller connection found.\n\nComplete KYC approval first.'

);

setLoading(false);

return;

}

// ── Create Truck ──

const newTruck = {

id:
`truck-${Date.now()}`,

registrationNumber:
registrationNumber.toUpperCase(),

assignedDriverId:
undefined,

tspId:
user.id,

tspName:
user.companyName ||
user.name,

sellerId:
approvedConnection.sellerId,

sellerName:
approvedConnection.sellerName,

sellerCode:
approvedConnection.sellerCode,

sensorConfigured:false,

sensorIntegrationComplete:false,

commercialApproval:false,

safetyApproval:false,

createdBy:
user.id,
compartments:

validCompartments.map(
c=>({

id:c.id,

capacity:
parseFloat(
c.capacity
),

fuelType:
c.fuelType,

currentVolume:0,

})
),

capacity:
totalCapacity,

status:
'PENDING_SELLER_APPROVAL',

currentLat:
28.6139 + (Math.random()-0.5)*0.05,

currentLng:
77.2090 + (Math.random()-0.5)*0.05,

createdAt:
new Date(),

};

addTruck(
newTruck
);

// ── Sensor Request ──

const sensorRequest:
SensorIntegrationRequest = {

id:
`sensor-${Date.now()}`,

transporterId:
user.id,

transporterName:
user.companyName ||
user.name,

sellerId:
approvedConnection.sellerId,

sellerName:
approvedConnection.sellerName,

sellerCode:
approvedConnection.sellerCode,

truckId:
newTruck.id,

truckRegistration:
newTruck.registrationNumber,


compartments:

validCompartments.map(
c=>({

id:c.id,

capacity:
parseFloat(
c.capacity
),

fuelType:
c.fuelType,

})
),

status:
'PENDING_SELLER_APPROVAL',

requestedAt:
new Date(),

sensorIntegrationComplete:
false,

};

addSensorRequest(
sensorRequest
);

// ── Notify Seller ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
approvedConnection.sellerId,

type:
'SENSOR_REQUEST',

title:
'🚛 New Sensor Integration Request',

message:
`${newTruck.registrationNumber} requires approval before sensor activation.`,

read:false,

createdAt:
new Date(),

});

// ── Success ──

alert(

'✅ Truck registered successfully.\n\nThe request has been forwarded to your connected seller for approval.\n\nAfter seller approval, platform admin will complete sensor integration and QR activation.'

);

router.push(
'/transport/trucks'
);

}
catch(error){

console.error(
'Truck registration error:',
error
);

alert(
'❌ Error registering truck.'
);

}
finally{

setLoading(false);

}

};

const quickFill = ()=>{

setRegistrationNumber(
'OM-1234'
);

setCompartments([

{
id:1,
capacity:'5000',
fuelType:'DIESEL',
},

{
id:2,
capacity:'3000',
fuelType:'PETROL',
},

]);

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

const totalCapacity =

compartments

.filter(
c=>

c.capacity

&&

parseFloat(
c.capacity
)>0
)

.reduce(
(sum,c)=>

sum +

parseFloat(
c.capacity
),

0
);

return (

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

Register New Truck 🚛

</h1>

<p className="text-gray-600">

Add a truck to your fleet

</p>

</div>

<div className="
max-w-3xl
mx-auto
">

<div className="
bg-blue-50
rounded-xl
p-6
mb-8
border
border-blue-200
">

<h3 className="
text-lg
font-bold
text-blue-900
mb-2
">

📋 Registration Process

</h3>

<ul className="
text-sm
text-blue-800
space-y-2
">

<li>
• Fill in truck details
</li>

<li>
• Assign driver later from Driver Management
</li>

<li>
• Configure fuel compartments
</li>

<li>
• Seller reviews sensor request
</li>

<li>
• Admin completes QR activation
</li>

<li>
• Truck becomes operational
</li>

</ul>

</div>

<form
onSubmit={handleSubmit}
className="
bg-white
rounded-xl
p-8
border
border-gray-200
"
>

<div className="
flex
items-center
justify-between
mb-6
">

<h2 className="
text-xl
font-bold
text-gray-900
">

Truck Details

</h2>

<button
type="button"
onClick={quickFill}
className="
text-sm
text-blue-600
hover:text-blue-700
font-medium
"
>

Quick Fill Demo 🎯

</button>

</div>

<div className="mb-6">

<label className="
block
text-sm
font-medium
text-gray-700
mb-2
">

Registration Number *

</label>

<input
type="text"
value={registrationNumber}
onChange={(e)=>
setRegistrationNumber(
e.target.value
)
}
className="
w-full
px-4
py-3
border
border-gray-300
rounded-lg
focus:ring-2
focus:ring-blue-500
uppercase
"
placeholder="OM-1234"
required
/>

</div>

<div className="mt-8">

<div className="
flex
items-center
justify-between
mb-4
">

<h3 className="
text-lg
font-bold
text-gray-900
">

Fuel Compartments
(
{compartments.length}
)

</h3>

<button
type="button"
onClick={addCompartment}
className="
bg-green-600
hover:bg-green-700
text-white
text-sm
font-medium
px-4
py-2
rounded-lg
"
>

+ Add Compartment

</button>

</div>

<div className="space-y-4">

{compartments.map(
(comp,index)=>(

<div
key={comp.id}
className="
bg-gray-50
rounded-lg
p-4
border
border-gray-200
"
>

<div className="
flex
items-center
justify-between
mb-3
">

<p className="
font-semibold
text-gray-900
">

Compartment {index+1}

</p>

{
compartments.length>1
&&

<button
type="button"
onClick={()=>
removeCompartment(
comp.id
)
}
className="
text-red-600
text-sm
"
>

✕ Remove

</button>

}

</div>

<div className="
grid
md:grid-cols-2
gap-4
">

<div>

<label className="
block
text-sm
font-medium
text-gray-700
mb-2
">

Capacity (Liters)

</label>

<input
type="number"
value={comp.capacity}
onChange={(e)=>

updateCompartment(
comp.id,
'capacity',
e.target.value
)

}
className="
w-full
px-4
py-2
border
border-gray-300
rounded-lg
"
placeholder="5000"
required
/>

</div>

<div>

<label className="
block
text-sm
font-medium
text-gray-700
mb-2
">

Fuel Type

</label>

<select
value={comp.fuelType}
onChange={(e)=>

updateCompartment(
comp.id,
'fuelType',
e.target.value
)

}
className="
w-full
px-4
py-2
border
border-gray-300
rounded-lg
"
>

<option value="DIESEL">
Diesel
</option>

<option value="PETROL">
Petrol
</option>

<option value="PREMIUM">
Premium
</option>

</select>

</div>

</div>

</div>

))
}

</div>

</div>

{
totalCapacity>0
&&

<div className="
mt-6
bg-green-50
rounded-lg
p-4
border
border-green-200
">

<p className="
text-sm
font-medium
text-green-900
mb-2
">

📊 Truck Summary

</p>

<div className="
text-sm
text-green-800
space-y-1
">

<p>

• Registration:
{' '}

<strong>
{registrationNumber}
</strong>

</p>

<p>

• Total Capacity:
{' '}

<strong>
{totalCapacity}
L
</strong>

</p>

<p>

• Compartments:
{' '}

<strong>
{compartments.length}
</strong>

</p>

</div>

</div>
}

<div className="
flex
gap-4
mt-8
">

<button
type="submit"
disabled={loading}
className="
flex-1
bg-blue-600
hover:bg-blue-700
disabled:bg-gray-400
text-white
font-semibold
py-3
rounded-lg
"
>

{
loading

?

'⏳ Registering...'

:

'🚛 Register Truck'

}

</button>

<button
type="button"
onClick={()=>
router.push(
'/transport/trucks'
)
}
className="
px-8
bg-gray-200
hover:bg-gray-300
text-gray-700
font-semibold
py-3
rounded-lg
"
>

Cancel

</button>

</div>

</form>

</div>

</main>

</div>

</div>

);

}