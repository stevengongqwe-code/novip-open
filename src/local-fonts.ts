export interface PersonalFont {id:string;name:string;family:string;codepoints:Set<number>;face:FontFace;}
/** Unicode cmap 4/12, matching the browser's preferred subtable (12 before 4).
 * Reject unsupported maps instead of reporting .notdef as a real character. */
export function fontCoverage(buffer:ArrayBuffer):Set<number>{
  const v=new DataView(buffer);const invalid=()=>new Error('字体格式不支持或文件已损坏，请使用含 Unicode 字符表的 TTF / OTF。');
  const check=(offset:number,length:number,end=buffer.byteLength)=>{if(!Number.isSafeInteger(offset)||offset<0||length<0||offset+length>end)throw invalid();};
  check(0,12);const signature=v.getUint32(0);if(![0x00010000,0x4f54544f,0x74727565].includes(signature))throw invalid();
  const count=v.getUint16(4);check(12,count*16);let start=0,end=0;
  for(let i=0;i<count;i++){const p=12+i*16;if(v.getUint32(p)===0x636d6170){start=v.getUint32(p+8);end=start+v.getUint32(p+12);check(start,end-start);}}
  if(!start)throw invalid();check(start,4,end);const n=v.getUint16(start+2);check(start+4,n*8,end);const maps:{p:number;format:number;rank:number}[]=[];
  for(let i=0;i<n;i++){const r=start+4+i*8,platform=v.getUint16(r),encoding=v.getUint16(r+2);if(platform!==0&&!(platform===3&&(encoding===1||encoding===10)))continue;const p=start+v.getUint32(r+4);check(p,2,end);const format=v.getUint16(p);if(format===4||format===12)maps.push({p,format,rank:(format===12?100:0)+(platform===3?1:0)});}
  const map=maps.sort((a,b)=>b.rank-a.rank)[0];if(!map)throw invalid();const chars=new Set<number>();const {p,format}=map;
  if(format===12){check(p,16,end);const length=v.getUint32(p+4),limit=p+length;check(p,length,end);const groups=v.getUint32(p+12);check(p+16,groups*12,limit);let previous=-1;
    for(let i=0;i<groups;i++){const b=p+16+i*12,first=v.getUint32(b),last=v.getUint32(b+4),glyph=v.getUint32(b+8);if(first<=previous||last<first||last>0x10ffff||glyph+last-first>65535)throw invalid();previous=last;for(let c=first;c<=last;c++)if(glyph+c-first!==0&&!(c>=0xd800&&c<=0xdfff)){chars.add(c);if(chars.size>150000)throw invalid();}}
  }else{check(p,16,end);const length=v.getUint16(p+2),limit=p+length;check(p,length,end);const seg=v.getUint16(p+6)/2;if(!Number.isInteger(seg)||!seg)throw invalid();check(p+14,seg*8+2,limit);let previous=-1;
    for(let i=0;i<seg;i++){const last=v.getUint16(p+14+i*2),first=v.getUint16(p+16+seg*2+i*2),delta=v.getInt16(p+16+seg*4+i*2),rangeAt=p+16+seg*6+i*2,range=v.getUint16(rangeAt);if(last<first||first<=previous)throw invalid();previous=last;
      for(let c=first;c<=last&&c<0xffff;c++){let glyph=0;if(range){const at=rangeAt+range+(c-first)*2;check(at,2,limit);glyph=v.getUint16(at);if(glyph)glyph=(glyph+delta)&0xffff;}else glyph=(c+delta)&0xffff;if(glyph&&!(c>=0xd800&&c<=0xdfff)){chars.add(c);if(chars.size>150000)throw invalid();}}}
  }
  if(!chars.size)throw invalid();return chars;
}
export function selectPersonal(fonts:PersonalFont[],char:string,index:number,seed:number):PersonalFont|undefined{
  const eligible=fonts.filter(f=>Array.from(char).every(c=>/\s/u.test(c)||f.codepoints.has(c.codePointAt(0)!)));
  // Rotate available outlines with position and seed, never choose a font missing the character.
  return eligible.length?eligible[((index+seed+(char.codePointAt(0)??0))%eligible.length+eligible.length)%eligible.length]:undefined;
}
export async function loadPersonalFont(file:File):Promise<PersonalFont>{
  if(!/\.(ttf|otf)$/i.test(file.name))throw new Error('个人字体目前支持 TTF / OTF 文件。');if(file.size>20*1024*1024)throw new Error('单个字库不能超过 20 MB。');
  const buffer=await file.arrayBuffer(),codepoints=fontCoverage(buffer),hash=await crypto.subtle.digest('SHA-256',buffer),id=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),family=`PaperPenLocal-${id.slice(0,16)}`,face=new FontFace(family,buffer);
  await face.load();return {id,name:file.name,family,codepoints,face};
}
