'use client';

import { useEffect, useState } from 'react';

import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';

import {
getCurrentUser,
getTrucks,
requestSellerConnection,
getSellerConnections,
} from '@/src/lib/demo-data';

export default function ConnectSellerPage(){

const [user,setUser]=
useState<any>(null);

const [truckId,setTruckId]=
useState('');

const [sellerCode,setSellerCode]=
useState('');

const [trucks,setTrucks]=
useState<any[]>([]);

const [requests,setRequests]=
useState<any[]>([]);

const [loading,setLoading]=
useState(false);

useEffect(()=>{

const current=
getCurrentUser();

setUser(
current
);

if(
current
){

setTrucks(

getTrucks()

.filter(
t=>
t.tspId===
current.id
)

);

}

refresh();

},[]);

const refresh=
()=>{

const current=
getCurrentUser();

if(!current)
return;

setRequests(

getSellerConnections()

.filter(
r=>
r.transporterId===
current.id
)

);

};

const submit=
()=>{

if(
!truckId
||
!sellerCode
){

alert(
'Select truck and seller code'
);

return;

}

try{

setLoading(
true
);

requestSellerConnection(

user.id,

sellerCode

);

alert(
'Request sent to seller'
);

setSellerCode(
''
);

refresh();

}
catch(
e:any
){

alert(
e.message
);

}
finally{

setLoading(
false
);

}

};

if(
!user
)
return null;

return(

<div className="flex min-h-screen bg-gray-50">

<Sidebar
userRole={
user.role
}
/>

<div className="flex-1">

<Header
user={
user
}
/>

<main className="p-8 max-w-6xl">

<div className="
bg-white
border
rounded-xl
p-8
mb-8
">

<h1 className="
text-3xl
font-bold
mb-2
">

Truck Sensor Connection

</h1>

<p className="
text-gray-600
">

Connect truck to seller privately

</p>

</div>

<div className="
bg-white
border
rounded-xl
p-6
mb-8
">

<select
value={
truckId
}
onChange={
e=>
setTruckId(
e.target.value
)
}
className="
w-full
border
rounded
p-4
mb-4
"
>

<option value="">
Select Truck
</option>

{

trucks.map(
truck=>(

<option
key={
truck.id
}
value={
truck.id
}
>

{
truck.registrationNumber
}

</option>

)

)

}

</select>

<input
value={
sellerCode
}
onChange={
e=>
setSellerCode(
e.target.value
)
}
placeholder="
SELLER-XXXX
"
className="
w-full
border
rounded
p-4
mb-4
"
/>

<button
onClick={
submit
}
disabled={
loading
}
className="
bg-blue-600
text-white
px-6
py-3
rounded
"
>

{

loading

?

'Sending'

:

'Request Connection'

}

</button>

</div>

<div className="
bg-white
border
rounded-xl
p-6
">

<h2 className="
font-bold
mb-4
">

Connection Requests

</h2>

<div className="
space-y-3
">

{

requests.length===0

?

(

<div className="
text-gray-500
">

No requests

</div>

)

:

(

requests.map(
r=>(

<div
key={
r.id
}
className="
border
rounded
p-4
"
>

<div className="
flex
justify-between
"
>

<div>

<div className="
font-bold
">

{
r.sellerName
}

</div>

<div>

{
r.sellerCode
}

</div>

</div>

<div>

{
r.status
}

</div>

</div>

</div>

))

)

}

</div>

</div>

</main>

</div>

</div>

);

}