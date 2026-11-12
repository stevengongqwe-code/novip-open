/** Connected ink regions are bitmap components, not semantic stroke sequences.
 * Original implementation inspired by the approach in Handright / HandWriteSim. */
export interface InkRegion {left:number;top:number;right:number;bottom:number;pixels:number[];}
export function inkRegions(data:Uint8ClampedArray,width:number,height:number):InkRegion[]{
  const size=width*height,seen=new Uint8Array(size),regions:InkRegion[]=[];
  if(data.length!==size*4)throw new Error('Invalid glyph raster');
  for(let i=0;i<size;i++){if(seen[i]||data[i*4+3]===0)continue;const stack=[i],pixels:number[]=[];seen[i]=1;let left=width,top=height,right=0,bottom=0;
    while(stack.length){const j=stack.pop()!,x=j%width,y=Math.floor(j/width);pixels.push(j);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const k=yy*width+xx;if(!seen[k]&&data[k*4+3]){seen[k]=1;stack.push(k);}}}
    regions.push({left,top,right:right+1,bottom:bottom+1,pixels});}
  return regions;
}
function random(seed:number){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function regionChanges(seed:number,count:number,amount:number,fontSize:number){if(amount<=0)return Array.from({length:count},()=>({x:0,y:0,angle:0,scale:1,alpha:1}));const r=random(seed),sigma=Math.max(0,Math.min(1,amount))*fontSize*.019;const normal=()=>Math.max(-2.2,Math.min(2.2,Math.sqrt(-2*Math.log(Math.max(r(),1e-9)))*Math.cos(2*Math.PI*r())));return Array.from({length:count},()=>({x:normal()*sigma,y:normal()*sigma,angle:normal()*sigma/fontSize*.38,scale:1+normal()*sigma/fontSize*.5,alpha:1-r()*.05*amount}));}
type Part={canvas:HTMLCanvasElement;x:number;y:number;width:number;height:number};
const cache=new Map<string,Part[]>();
export function clearPenCache(){cache.clear();}
function parts(char:string,family:string,size:number,ink:string):Part[]{
  const key=JSON.stringify([char,family,size,ink]);const found=cache.get(key);if(found){cache.delete(key);cache.set(key,found);return found;}
  const ratio=4,pad=Math.ceil(size*.55),base=document.createElement('canvas');base.width=Math.ceil((size*2+pad*2)*ratio);base.height=Math.ceil((size*1.5+pad*2)*ratio);const c=base.getContext('2d',{willReadFrequently:true})!;
  c.scale(ratio,ratio);c.font=`${size}px "${family}"`;c.fillStyle=ink;c.textBaseline='alphabetic';const baseline=pad+size;c.fillText(char,pad,baseline);
  const bitmap=c.getImageData(0,0,base.width,base.height),regions=inkRegions(bitmap.data,base.width,base.height);
  const result=regions.map(region=>{const width=region.right-region.left,height=region.bottom-region.top,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d')!,image=context.createImageData(width,height);
    for(const i of region.pixels){const x=i%base.width-region.left,y=Math.floor(i/base.width)-region.top,j=(y*width+x)*4;for(let k=0;k<4;k++)image.data[j+k]=bitmap.data[i*4+k];}context.putImageData(image,0,0);
    return {canvas,x:region.left/ratio-pad,y:region.top/ratio-baseline,width:width/ratio,height:height/ratio};});
  cache.set(key,result);if(cache.size>256)cache.delete(cache.keys().next().value!);base.width=base.height=1;return result;
}
export function drawPen(c:CanvasRenderingContext2D,char:string,family:string,size:number,ink:string,seed:number,amount:number){
  const regions=parts(char,family,size,ink),changes=regionChanges(seed,regions.length,amount,size);
  for(let i=0;i<regions.length;i++){const p=regions[i],d=changes[i];c.save();c.translate(p.x+p.width/2+d.x,p.y+p.height/2+d.y);c.rotate(d.angle);c.scale(d.scale,d.scale);c.globalAlpha*=d.alpha;c.drawImage(p.canvas,-p.width/2,-p.height/2,p.width,p.height);c.restore();}
}
