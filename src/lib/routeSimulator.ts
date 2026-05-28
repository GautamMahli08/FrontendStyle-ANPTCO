export interface RoutePoint{

lat:number;

lng:number;

}

export function
generateRoutePoints(

start:
RoutePoint,

end:
RoutePoint,

steps=100

){

const points:
RoutePoint[]=[];

for(
let i=0;
i<=steps;
i++
){

const lat=

start.lat+

(
(end.lat-start.lat)
*
(i/steps)
);

const lng=

start.lng+

(
(end.lng-start.lng)
*
(i/steps)
);

points.push({
lat,
lng,
});

}

return points;

}