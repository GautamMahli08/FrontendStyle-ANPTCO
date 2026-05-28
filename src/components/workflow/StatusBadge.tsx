'use client';

import {

OrderStatus,

TruckStatus,

TicketStatus,

KYCStatus,

} from '@/src/types';

type Status =

OrderStatus

|

TruckStatus

|

TicketStatus

|

KYCStatus

|

string;

export default function StatusBadge({

status,

}:{

status:Status

}){

const statusConfig:
Record<string,{

label:string;

color:string;

}> = {

// ── Order Statuses ──

PLACED:{

label:'📋 Placed',

color:
'bg-yellow-100 text-yellow-800',

},

ACCEPTED:{

label:'✅ Accepted',

color:
'bg-green-100 text-green-800',

},

TRUCKS_ASSIGNED:{

label:'🚛 Trucks Assigned',

color:
'bg-blue-100 text-blue-800',

},

EN_ROUTE:{

label:'🛣️ En Route',

color:
'bg-purple-100 text-purple-800',

},

ARRIVED:{

label:'📍 Arrived',

color:
'bg-indigo-100 text-indigo-800',

},

DELIVERY_ACCEPTED:{

label:'✓ Delivery Accepted',

color:
'bg-green-100 text-green-800',

},

OFFLOADING_IN_PROGRESS:{

label:'⬇️ Offloading',

color:
'bg-orange-100 text-orange-800',

},

OFFLOADING_COMPLETE:{

label:'✓ Offloading Complete',

color:
'bg-green-100 text-green-800',

},

COMPLETED:{

label:'🎉 Completed',

color:
'bg-emerald-100 text-emerald-800',

},

// ── Truck Workflow ──

PENDING_SELLER_APPROVAL:{

label:'⏳ Pending Seller Approval',

color:
'bg-orange-100 text-orange-800',

},

PENDING_ADMIN_APPROVAL:{

label:'⚙️ Pending Admin Approval',

color:
'bg-blue-100 text-blue-800',

},

ADMIN_APPROVED:{

label:'✅ Admin Approved',

color:
'bg-green-100 text-green-800',

},

ADMIN_REJECTED:{

label:'❌ Admin Rejected',

color:
'bg-red-100 text-red-800',

},

SELLER_REJECTED:{

label:'❌ Seller Rejected',

color:
'bg-red-100 text-red-800',

},

ACTIVE:{

label:'🟢 Active',

color:
'bg-emerald-100 text-emerald-800',

},

IDLE:{

label:'🟢 Idle',

color:
'bg-green-100 text-green-800',

},

ASSIGNED:{

label:'📋 Assigned',

color:
'bg-blue-100 text-blue-800',

},

OFFLOADING:{

label:'⬇️ Offloading',

color:
'bg-orange-100 text-orange-800',

},

RETURNING:{

label:'🔙 Returning',

color:
'bg-purple-100 text-purple-800',

},

// ── Ticket Statuses ──

PENDING:{

label:'⏳ Pending',

color:
'bg-yellow-100 text-yellow-800',

},

IN_PROGRESS:{

label:'🔄 In Progress',

color:
'bg-blue-100 text-blue-800',

},

RESOLVED:{

label:'✅ Resolved',

color:
'bg-green-100 text-green-800',

},

ON_HOLD:{

label:'⏸️ On Hold',

color:
'bg-red-100 text-red-800',

},

// ── KYC ──

APPROVED:{

label:'✅ Approved',

color:
'bg-green-100 text-green-800',

},

REJECTED:{

label:'❌ Rejected',

color:
'bg-red-100 text-red-800',

},

};

const config =

statusConfig[status]

||

{

label:

status

.replaceAll(
'_',
' '
)

.toLowerCase()

.replace(
/\b\w/g,
l=>l.toUpperCase()
),

color:
'bg-gray-100 text-gray-800',

};

return(

<span
className={`
inline-flex
items-center
px-3
py-1
rounded-full
text-xs
font-medium
${config.color}
`}
>

{config.label}

</span>

);

}