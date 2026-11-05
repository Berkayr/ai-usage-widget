// Largest axis-aligned rectangle outside the gallery's content boxes.
export function largestEmptyRectangle({width,height,rects}) {
 const boxes=rects.map(r=>({x:Math.max(0,r.x),y:Math.max(0,r.y),right:Math.min(width,r.x+r.width),bottom:Math.min(height,r.y+r.height)}));
 const edges=[...new Set([0,width,...boxes.flatMap(r=>[r.x,r.right])])].sort((a,b)=>a-b);
 let best={area:0};
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++) {
  const x=edges[i],right=edges[j];
  const occupied=boxes.filter(r=>r.x<right&&r.right>x).sort((a,b)=>a.y-b.y);
  let y=0;
  for(const r of [...occupied,{y:height,bottom:height}]) {
   const area=(right-x)*Math.max(0,r.y-y);
   if(area>best.area)best={x,y,width:right-x,height:r.y-y,area};
   y=Math.max(y,r.bottom);
  }
 }
 return {...best,ratio:best.area/(width*height)};
}
