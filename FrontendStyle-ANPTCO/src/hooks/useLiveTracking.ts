'use client';

import {
useEffect,
useState,
} from 'react';

interface Point {

lat:number;

lng:number;

}

export default function
useLiveTracking(

route:
Point[],

speed=1

){

const [position,
setPosition]=
useState<Point>(
route[0]
);

const [currentIndex,
setCurrentIndex]=
useState(0);

const [completed,
setCompleted]=
useState(false);

useEffect(()=>{

if(
!route.length
)
return;

if(
currentIndex
>=
route.length-1
){

setCompleted(
true
);

return;

}

const interval=
setInterval(()=>{

setCurrentIndex(
prev=>{

const next=
prev+1;

if(
next
<
route.length
){

setPosition(
route[next]
);

}

return next;

});

},1000/speed);

return()=>{

clearInterval(
interval
);

};

},[
currentIndex,
route,
speed,
]);

return{

position,

currentIndex,

completed,

};

}