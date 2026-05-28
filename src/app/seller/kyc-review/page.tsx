'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import {

getCurrentUser,

getKYCDocuments,

updateKYCDocument,

updateUser,
getSellerConnections,
addNotification,

} from '@/src/lib/demo-data';

export default function KYCReviewPage() {

const router = useRouter();

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [kycDocuments,
setKycDocuments] =
useState<any[]>([]);

const [selectedDoc,
setSelectedDoc] =
useState<any>(null);

const [showModal,
setShowModal] =
useState(false);

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

loadKYCDocuments(
currentUser
);

},[router]);

// ── Load Seller-Specific KYC Docs ──

const loadKYCDocuments = (
currentUser?:any
)=>{

const seller =
currentUser ||
getCurrentUser();

const allDocs =
getKYCDocuments();

const pendingDocs =

allDocs.filter(
(doc:any)=>

doc.reviewStatus ===
'PENDING'

&&

doc.sellerCode ===
seller?.sellerCode
);

setKycDocuments(
pendingDocs
);

};

// ── Approve KYC ──

const handleApprove = (
docId:string
)=>{

const doc =

kycDocuments.find(
d=>d.id===docId
);

if(!doc) return;

// ── Approve KYC ──

updateKYCDocument(

docId,

{

reviewStatus:
'APPROVED',

reviewedBy:
user.id,

reviewedAt:
new Date(),

}

);

// ── Verify Transporter ──

updateUser(

doc.userId,

{

verified:true,

sellerApproved:true,

}

);

// ── Auto Create Seller Connection ──

const existingConnections =

getSellerConnections();

const alreadyLinked =

existingConnections.find(
(c:any)=>

c.transporterId ===
doc.userId

&&

c.sellerId ===
user.id
);

if(!alreadyLinked){

existingConnections.push({

id:
`conn-${Date.now()}`,

sellerId:
user.id,

sellerName:
user.companyName,

sellerCode:
user.sellerCode,

transporterId:
doc.userId,

transporterName:
doc.userName,

status:
'APPROVED',

requestedAt:
new Date(),

approvedAt:
new Date(),

});

localStorage.setItem(

'fuel_seller_connections',

JSON.stringify(
existingConnections
)

);

}

// ── Notify Transporter ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
doc.userId,

type:
'KYC_APPROVED',

title:
'✅ KYC Approved',

message:
'Your KYC has been approved. Seller connection is now active.',

read:false,

createdAt:
new Date(),

});

alert(
'✅ KYC approved and transporter linked successfully!'
);

loadKYCDocuments();

setShowModal(false);

setSelectedDoc(null);

};

// ── Reject KYC ──

const handleReject = (
docId:string
)=>{

const reason =
prompt(
'Reason for rejection:'
);

if(!reason) return;

const doc =

kycDocuments.find(
d=>d.id===docId
);

if(!doc) return;

updateKYCDocument(

docId,

{

reviewStatus:
'REJECTED',

reviewedBy:
user.id,

reviewedAt:
new Date(),

}

);

addNotification({

id:
`notif-${Date.now()}`,

userId:
doc.userId,

type:
'KYC_REJECTED',

title:
'❌ KYC Rejected',

message:
`Your KYC documents were rejected: ${reason}`,

read:false,

createdAt:
new Date(),

});

alert(
'❌ KYC rejected'
);

loadKYCDocuments(user);

setShowModal(false);

setSelectedDoc(null);

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

<main className="p-8">

<div className="mb-8">

<h1 className="
text-3xl
font-bold
text-gray-900
mb-2
">

KYC Review 📋

</h1>

<p className="text-gray-600">

Review and approve transporter KYC documents

</p>

</div>

{/* Stats */}

<div className="
mb-6
bg-white
rounded-xl
border
border-gray-200
p-4
flex
items-center
gap-6
">

<div className="text-center">

<p className="
text-2xl
font-bold
text-orange-600
">

{kycDocuments.length}

</p>

<p className="
text-xs
text-gray-500
">

Pending Review

</p>

</div>

<div className="
h-10
w-px
bg-gray-200
"/>

<p className="
text-sm
text-gray-500
">

Approve transporter KYC to activate seller connection and allow truck registration.

</p>

</div>

{
kycDocuments.length > 0

?

<div className="
grid
md:grid-cols-2
gap-6
">

{
kycDocuments.map(
(doc:any)=>(

<div
key={doc.id}
className="
bg-white
rounded-xl
p-6
border
border-gray-200
hover:shadow-md
transition-shadow
"
>

<div className="
flex
items-start
justify-between
mb-4
">

<div className="
flex
items-center
gap-3
">

<div className="
w-10
h-10
rounded-full
bg-orange-100
text-orange-700
font-bold
flex
items-center
justify-center
flex-shrink-0
">

{
doc.userName?.charAt(0)
||
'?'
}

</div>

<div>

<h3 className="
text-lg
font-semibold
text-gray-900
">

{doc.userName}

</h3>

<p className="
text-sm
text-gray-500
">

{doc.userEmail}

</p>

</div>

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

PENDING

</span>

</div>

<div className="
space-y-2
text-sm
mb-5
bg-gray-50
rounded-lg
p-3
">

<div className="
flex
justify-between
">

<span className="
text-gray-500
">

Document Type

</span>

<span className="
font-medium
text-gray-800
">

{doc.documentType}

</span>

</div>

<div className="
flex
justify-between
">

<span className="
text-gray-500
">

Seller Code

</span>

<span className="
font-medium
text-gray-800
">

{
doc.sellerCode
||
'N/A'
}

</span>

</div>

<div className="
flex
justify-between
">

<span className="
text-gray-500
">

Submitted

</span>

<span className="
font-medium
text-gray-800
">

{
doc.uploadedAt

?

new Date(
doc.uploadedAt
).toLocaleDateString()

:

'N/A'
}

</span>

</div>

</div>

<button
onClick={()=>{
setSelectedDoc(doc);
setShowModal(true);
}}
className="
w-full
bg-blue-600
hover:bg-blue-700
text-white
font-medium
py-2.5
rounded-lg
transition-colors
text-sm
"
>

Review Document →

</button>

</div>

))
}

</div>

:

<div className="
bg-white
rounded-xl
p-16
text-center
border
border-gray-200
">

<span className="
text-6xl
mb-4
block
">

✅

</span>

<h3 className="
text-xl
font-semibold
text-gray-900
mb-2
">

All Caught Up!

</h3>

<p className="
text-gray-500
">

No pending KYC documents to review.

</p>

</div>

}

</main>

</div>

{/* Modal */}

{
showModal
&&
selectedDoc
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
shadow-2xl
">

<div className="
flex
items-center
justify-between
mb-6
">

<h3 className="
text-2xl
font-bold
text-gray-900
">

Review KYC Document

</h3>

<button
onClick={()=>
setShowModal(false)
}
className="
text-gray-400
hover:text-gray-600
text-2xl
leading-none
"
>

×

</button>

</div>

<div className="
space-y-3
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
mb-1
uppercase
tracking-wide
">

Applicant

</p>

<p className="
font-semibold
text-lg
text-gray-900
">

{selectedDoc.userName}

</p>

<p className="
text-sm
text-gray-500
">

{selectedDoc.userEmail}

</p>

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-xs
text-gray-500
mb-1
uppercase
tracking-wide
">

Document Type

</p>

<p className="
font-semibold
text-gray-900
">

{selectedDoc.documentType}

</p>

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-xs
text-gray-500
mb-1
uppercase
tracking-wide
">

Seller Code

</p>

<p className="
font-semibold
text-gray-900
">

{
selectedDoc.sellerCode
||
'N/A'
}

</p>

</div>

<div className="
bg-gray-50
rounded-lg
p-4
">

<p className="
text-xs
text-gray-500
mb-1
uppercase
tracking-wide
">

Submitted On

</p>

<p className="
font-semibold
text-gray-900
">

{
selectedDoc.uploadedAt

?

new Date(
selectedDoc.uploadedAt
).toLocaleDateString(
'en-GB',
{
day:'numeric',
month:'long',
year:'numeric',
}
)

:

'N/A'
}

</p>

</div>

{
selectedDoc.documentUrl

?

<div className="
bg-blue-50
rounded-lg
p-4
border
border-blue-100
">

<p className="
text-xs
text-gray-500
mb-2
uppercase
tracking-wide
">

Document File

</p>

<a
href={
selectedDoc.documentUrl
}
target="_blank"
rel="noopener noreferrer"
className="
text-blue-600
hover:text-blue-700
text-sm
font-medium
"
>

View Document →

</a>

</div>

:

<div className="
bg-yellow-50
rounded-lg
p-4
border
border-yellow-100
">

<p className="
text-sm
text-yellow-700
">

⚠️ No document file uploaded

</p>

</div>

}

</div>

<div className="
flex
gap-3
">

<button
onClick={()=>
handleApprove(
selectedDoc.id
)
}
className="
flex-1
bg-green-600
hover:bg-green-700
text-white
font-semibold
py-3
rounded-lg
transition-colors
"
>

✓ Approve

</button>

<button
onClick={()=>
handleReject(
selectedDoc.id
)
}
className="
flex-1
bg-red-600
hover:bg-red-700
text-white
font-semibold
py-3
rounded-lg
transition-colors
"
>

✕ Reject

</button>

<button
onClick={()=>
setShowModal(false)
}
className="
px-8
bg-gray-100
hover:bg-gray-200
text-gray-700
font-medium
py-3
rounded-lg
transition-colors
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