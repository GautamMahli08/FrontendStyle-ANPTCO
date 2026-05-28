'use client';

import { useState,useEffect } from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/src/components/layout/Sidebar';

import Header from '@/src/components/layout/Header';

import {

getCurrentUser,

addKYCDocument,

getKYCDocuments,

addNotification,

findSellerByCode,

} from '@/src/lib/demo-data';

interface DocumentUploadProps{

label:string;

required:boolean;

onChange:(file:File|null)=>void;

}

export default function KYCUploadPage(){

const router =
useRouter();

const [user,setUser] =
useState<any>(null);

const [mounted,setMounted] =
useState(false);

const [existingKYC,
setExistingKYC] =
useState<any[]>([]);

const [uploading,
setUploading] =
useState(false);

const [formData,
setFormData] =
useState({

businessName:'',
registrationNumber:'',
taxId:'',
address:'',
sellerCode:'',

documents:{

businessLicense:
null as File|null,

insurance:
null as File|null,

taxCertificate:
null as File|null,

},

});

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

loadKYCData(
currentUser
);

},[router]);

const loadKYCData = (
currentUser:any
)=>{

const allKYC =
getKYCDocuments();

setExistingKYC(

allKYC.filter(
(k:any)=>

k.userId ===
currentUser.id
)

);

};

const handleFileChange = (

docType:string,

file:File|null

)=>{

setFormData(prev=>({

...prev,

documents:{

...prev.documents,

[docType]:
file,

},

}));

};

const handleSubmit = async (
e:React.FormEvent
)=>{

e.preventDefault();

if(!user) return;

if(

!formData.businessName

||

!formData.registrationNumber

||

!formData.taxId

||

!formData.address

||

!formData.sellerCode

){

alert(
'⚠️ Please fill all required fields'
);

return;

}

if(

!formData.documents.businessLicense

||

!formData.documents.insurance

||

!formData.documents.taxCertificate

){

alert(
'⚠️ Upload all required documents'
);

return;

}

setUploading(true);

// ── Validate Seller ──

const seller =

findSellerByCode(
formData.sellerCode
);

if(!seller){

alert(
'❌ Invalid seller code'
);

setUploading(false);

return;

}

// ── Simulate Upload ──

setTimeout(()=>{

// ── Create KYC ──

addKYCDocument({

id:
`kyc-${Date.now()}`,

userId:
user.id,

userName:
`${user.firstName} ${user.lastName}`,

userEmail:
user.email,

sellerId:
seller.id,

sellerName:
seller.companyName,

sellerCode:
formData.sellerCode,

documentType:
'Transport Business License',

documentUrl:
URL.createObjectURL(
formData.documents.businessLicense!
),

reviewStatus:
'PENDING',

uploadedAt:
new Date(),

reviewedAt:
undefined,

reviewedBy:
undefined,

businessName:
formData.businessName,

registrationNumber:
formData.registrationNumber,

taxId:
formData.taxId,

address:
formData.address,

documents:{

businessLicense:
formData.documents.businessLicense?.name,

insurance:
formData.documents.insurance?.name,

taxCertificate:
formData.documents.taxCertificate?.name,

},

});

// ── Notify Seller ──

addNotification({

id:
`notif-${Date.now()}`,

userId:
seller.id,

type:
'KYC_SUBMITTED',

title:
'📄 New KYC Submission',

message:
`${user.firstName} ${user.lastName} submitted transporter KYC for approval.`,

read:false,

createdAt:
new Date(),

});

alert(
'✅ KYC submitted successfully! Waiting for seller approval.'
);

setUploading(false);

loadKYCData(user);

router.push(
'/transport/dashboard'
);

},1500);

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

const hasApprovedKYC =

existingKYC.some(
(k:any)=>

k.reviewStatus ===
'APPROVED'
);

const hasPendingKYC =

existingKYC.some(
(k:any)=>

k.reviewStatus ===
'PENDING'
);

const hasRejectedKYC =

existingKYC.some(
(k:any)=>

k.reviewStatus ===
'REJECTED'
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

KYC Document Upload

</h1>

<p className="text-gray-600">

Submit transporter verification documents for seller approval

</p>

</div>

{
hasApprovedKYC
&&

<div className="
bg-green-50
border-2
border-green-200
rounded-xl
p-6
mb-8
">

<h3 className="
font-bold
text-green-900
mb-1
">

✅ KYC Approved

</h3>

<p className="
text-green-800
text-sm
">

Seller connection is active. You can now register trucks.

</p>

</div>
}

{
hasPendingKYC
&&

<div className="
bg-blue-50
border-2
border-blue-200
rounded-xl
p-6
mb-8
">

<h3 className="
font-bold
text-blue-900
mb-1
">

⏳ KYC Under Review

</h3>

<p className="
text-blue-800
text-sm
">

Waiting for seller approval.

</p>

</div>
}

{
(!hasApprovedKYC && !hasPendingKYC)
&&

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

<h2 className="
text-2xl
font-bold
text-gray-900
mb-6
">

Business Information

</h2>

<div className="space-y-6">

<input
type="text"
placeholder="Business Name"
value={formData.businessName}
onChange={(e)=>
setFormData({

...formData,

businessName:
e.target.value

})
}
className="
w-full
px-4
py-3
border
rounded-lg
"
/>

<input
type="text"
placeholder="Registration Number"
value={formData.registrationNumber}
onChange={(e)=>
setFormData({

...formData,

registrationNumber:
e.target.value

})
}
className="
w-full
px-4
py-3
border
rounded-lg
"
/>

<input
type="text"
placeholder="Tax ID"
value={formData.taxId}
onChange={(e)=>
setFormData({

...formData,

taxId:
e.target.value

})
}
className="
w-full
px-4
py-3
border
rounded-lg
"
/>

<textarea
placeholder="Business Address"
value={formData.address}
onChange={(e)=>
setFormData({

...formData,

address:
e.target.value

})
}
rows={3}
className="
w-full
px-4
py-3
border
rounded-lg
"
/>

<input
type="text"
placeholder="SELLER-XXXXX"
value={formData.sellerCode}
onChange={(e)=>
setFormData({

...formData,

sellerCode:
e.target.value

})
}
className="
w-full
px-4
py-3
border
rounded-lg
"
/>

<div className="
bg-gray-50
rounded-lg
p-4
text-sm
text-gray-600
">

Enter seller code provided by your fuel supplier.

</div>

<hr/>

<h3 className="
text-xl
font-bold
">

Required Documents

</h3>

<DocumentUpload
label="Business License"
required
onChange={(f)=>
handleFileChange(
'businessLicense',
f
)
}
/>

<DocumentUpload
label="Insurance Certificate"
required
onChange={(f)=>
handleFileChange(
'insurance',
f
)
}
/>

<DocumentUpload
label="Tax Certificate"
required
onChange={(f)=>
handleFileChange(
'taxCertificate',
f
)
}
/>

<button
type="submit"
disabled={uploading}
className="
w-full
bg-green-600
hover:bg-green-700
disabled:bg-gray-400
text-white
font-bold
py-4
rounded-lg
"
>

{
uploading

?

'⏳ Uploading...'

:

'✓ Submit KYC Documents'
}

</button>

</div>

</form>
}

</main>

</div>

</div>

);

}

function DocumentUpload({

label,

required,

onChange,

}:DocumentUploadProps){

const [fileName,
setFileName] =
useState('');

const handleFileSelect = (
e:React.ChangeEvent<HTMLInputElement>
)=>{

const file =
e.target.files?.[0];

if(file){

setFileName(
file.name
);

onChange(file);

}

};

return(

<div className="
border-2
border-dashed
border-gray-300
rounded-lg
p-6
hover:border-blue-400
transition-colors
">

<div className="
flex
items-center
justify-between
">

<div className="flex-1">

<label className="
block
text-sm
font-medium
text-gray-700
mb-1
">

{label}

{
required
&&

<span className="text-red-500">
*
</span>
}

</label>

{
fileName

?

<p className="
text-sm
text-green-600
">

✓
{' '}
{fileName}

</p>

:

<p className="
text-xs
text-gray-500
">

PDF, JPG, PNG

</p>
}

</div>

<label className="
bg-blue-600
hover:bg-blue-700
text-white
font-medium
px-4
py-2
rounded-lg
cursor-pointer
">

Choose File

<input
type="file"
accept=".pdf,.jpg,.jpeg,.png"
onChange={handleFileSelect}
className="hidden"
required={required}
/>

</label>

</div>

</div>

);

}