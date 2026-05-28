'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/src/components/layout/Sidebar';
import Header from '@/src/components/layout/Header';

import {
getCurrentUser,
requestSellerConnection,
getSellerConnections,
} from '@/src/lib/demo-data';

export default function SensorIntegrationPage(){

const [user,setUser]=
useState<any>(null);

const [sellerCode,
setSellerCode]=
useState('');

const [loading,
setLoading]=
useState(false);

const [requests,
setRequests]=
useState<any[]>([]);

useEffect(()=>{

const current=
getCurrentUser();

setUser(
current
);

loadRequests();

},[]);

const loadRequests=
()=>{

const all=
getSellerConnections();

const current=
getCurrentUser();

setRequests(

all.filter(

r=>

r.transporterId
===

current?.id

)

);

};

const handleRequest=
()=>{

if(
!sellerCode.trim()
){

alert(
'Enter seller code'
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

setSellerCode(
''
);

loadRequests();

alert(
'Request sent'
);

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

<main className="p-8 max-w-5xl">

<div className="
bg-white
rounded-xl
p-8
border
mb-8
">

<h1 className="
text-3xl
font-bold
mb-3
">

Sensor Integration

</h1>

<p className="text-gray-600">

Connect with seller using private seller code

</p>

</div>

<div className="
bg-white
rounded-xl
border
p-6
mb-8
">

<h2 className="
font-bold
text-xl
mb-4
">

Enter Seller Code

</h2>

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
handleRequest
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

'Sending...'

:

'Request Connection'

}

</button>

</div>

<div className="
bg-white
rounded-xl
border
p-6
">

<h2 className="
font-bold
text-xl
mb-6
">

My Requests

</h2>

<div className="
space-y-4
">

{

requests.length
===0

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
req=>(

<div
key={
req.id
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

<p className="
font-bold
">

Seller

</p>

<p>

{
req.sellerName
}

</p>

</div>

<div>

<span
className={

req.status
===
'APPROVED'

?

'text-green-600'

:

req.status
===
'REJECTED'

?

'text-red-600'

:

'text-orange-600'

}

>

{
req.status
}

</span>

</div>

</div>

<div className="
text-sm
text-gray-500
mt-2
">

{
new Date(
req.requestedAt
)
.toLocaleString()
}

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