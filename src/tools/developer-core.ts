/** NOVIP 独立实现：不含 ToolKnit 源码、品牌或资产；只借鉴公开产品需求。 */
export type DevOperation =
  |'json-pretty'|'json-minify'
  |'base64-encode'|'base64-decode'
  |'base64url-encode'|'base64url-decode'
  |'url-encode'|'url-decode'
  |'md5'|'sha1'|'sha256'|'sha384'|'sha512'
  |'hmac-sha256'|'jwt-decode'|'password'|'uuid';
export type HashAlgorithm='MD5'|'SHA-1'|'SHA-256'|'SHA-384'|'SHA-512';
export interface DeveloperOptions{hmacKeyHex?:string;uuidCount?:number|string;password?:Partial<PasswordOptions>;}
export const MAX_INPUT=250_000;
const MAX_UUID_COUNT=20;
const MAX_HMAC_KEY_CHARS=1024;
const MAX_ABS_EPOCH_MS=8_640_000_000_000_000;
const SHANGHAI_OFFSET_MS=8*60*60*1000;
const encoder=new TextEncoder();
const utf8Decoder=new TextDecoder('utf-8',{fatal:true});

function validateTextInput(input:string){
  if(!input.length)throw new Error('请先输入内容。');
  if(input.length>MAX_INPUT)throw new Error('输入不能超过 25 万字符。');
}
function hexFromBytes(bytes:Uint8Array){
  let out='';
  for(const byte of bytes)out+=byte.toString(16).padStart(2,'0');
  return out;
}
function isPlainObject(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}

/* ---------- MD5：按 RFC 1321 独立实现的纯 TypeScript 版本（校验用途，不是加密） ---------- */
const MD5_SHIFTS=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const MD5_K=new Uint32Array([
  0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
  0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
  0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
  0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
  0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
  0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
  0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
  0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391,
]);
function rotateLeft(value:number,bits:number){return (value<<bits)|(value>>>(32-bits));}
function md5WordHex(word:number){
  let out='';
  for(let shift=0;shift<32;shift+=8)out+=((word>>>shift)&0xff).toString(16).padStart(2,'0');
  return out;
}
export function md5Hex(text:string):string{
  const data=encoder.encode(text);
  const bitLength=data.length*8;
  const paddedLength=(((data.length+8)>>6)+1)<<6;
  const bytes=new Uint8Array(paddedLength);
  bytes.set(data);
  bytes[data.length]=0x80;
  const view=new DataView(bytes.buffer);
  view.setUint32(paddedLength-8,bitLength>>>0,true);
  view.setUint32(paddedLength-4,Math.floor(bitLength/4294967296),true);
  const words=new Uint32Array(16);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(let offset=0;offset<paddedLength;offset+=64){
    for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4,true);
    let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){
      let f:number,g:number;
      if(i<16){f=(b&c)|(~b&d);g=i;}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)&15;}
      else if(i<48){f=b^c^d;g=(3*i+5)&15;}
      else{f=c^(b|~d);g=(7*i)&15;}
      const previousD=d;
      d=c;c=b;
      b=(b+rotateLeft((a+f+MD5_K[i]+words[g])|0,MD5_SHIFTS[i]))|0;
      a=previousD;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return md5WordHex(a0)+md5WordHex(b0)+md5WordHex(c0)+md5WordHex(d0);
}

/* ---------- 哈希与 HMAC：MD5 走纯 TS，其余使用浏览器 Web Crypto ---------- */
const WEB_CRYPTO_LABELS:Record<Exclude<HashAlgorithm,'MD5'>,string>={
  'SHA-1':'SHA-1','SHA-256':'SHA-256','SHA-384':'SHA-384','SHA-512':'SHA-512',
};
export async function hashHex(algorithm:HashAlgorithm,text:string):Promise<string>{
  if(algorithm==='MD5')return md5Hex(text);
  if(!globalThis.crypto?.subtle)throw new Error('当前环境无法使用 Web Crypto，请通过 HTTPS 访问。');
  const digest=await globalThis.crypto.subtle.digest(WEB_CRYPTO_LABELS[algorithm],encoder.encode(text));
  return hexFromBytes(new Uint8Array(digest));
}
function parseHmacKey(keyHex:string|undefined){
  const clean=(keyHex??'').trim();
  if(!clean)throw new Error('请填写 HMAC 十六进制密钥，例如 6b6579。');
  if(clean.length>MAX_HMAC_KEY_CHARS)throw new Error('HMAC 密钥过长，请控制在 512 字节（1024 个十六进制字符）以内。');
  if(!/^[0-9a-fA-F]+$/.test(clean)||clean.length%2!==0)throw new Error('HMAC 密钥必须是偶数位十六进制字符，例如 6b6579。');
  const bytes=new Uint8Array(clean.length/2);
  for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(clean.slice(i*2,i*2+2),16);
  return bytes;
}
export async function hmacSha256Hex(keyHex:string,message:string):Promise<string>{
  const keyBytes=parseHmacKey(keyHex);
  if(!globalThis.crypto?.subtle)throw new Error('当前环境无法使用 Web Crypto，请通过 HTTPS 访问。');
  const key=await globalThis.crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await globalThis.crypto.subtle.sign('HMAC',key,encoder.encode(message));
  return hexFromBytes(new Uint8Array(signature));
}

/* ---------- Base64 / Base64 URL-safe ---------- */
function encodeUtf8Base64(value:string){
  const bytes=encoder.encode(value);
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=8192){
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  }
  return btoa(binary);
}
function bytesToUtf8(bytes:Uint8Array){
  try{return utf8Decoder.decode(bytes);}catch{throw new Error('解码后的字节不是有效 UTF-8 文本。');}
}
function decodeUtf8Base64(value:string){
  const normalized=value.replace(/\s+/g,'');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized))throw new Error('无效 Base64，请检查字符与填充。');
  const binary=atob(normalized);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytesToUtf8(bytes);
}
export function encodeBase64Url(text:string){
  return encodeUtf8Base64(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeBase64UrlBytes(value:string){
  const cleaned=value.replace(/\s+/g,'');
  if(!cleaned)throw new Error('内容为空。');
  if(!/^[A-Za-z0-9_-]+$/.test(cleaned))throw new Error('包含非 Base64URL 字符。');
  if(cleaned.length%4===1)throw new Error('Base64URL 长度无效。');
  const standard=cleaned.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-cleaned.length%4)%4);
  const binary=atob(standard);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
export function decodeBase64Url(text:string){
  const raw=text.replace(/\s+/g,'');
  if(!raw)throw new Error('请先输入内容。');
  if(!/^[A-Za-z0-9+/_-]*={0,2}$/.test(raw))throw new Error('无效 Base64 URL-safe 文本，请检查字符与填充。');
  const cleaned=raw.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(cleaned.length%4===1)throw new Error('无效 Base64 URL-safe 文本，请检查字符与填充。');
  return bytesToUtf8(decodeBase64UrlBytes(cleaned));
}

/* ---------- 时间格式化（固定 UTC+8，不依赖运行环境时区） ---------- */
function pad(value:number,length=2){return String(value).padStart(length,'0');}
function yearText(year:number){return year>=0?pad(year,4):'-'+pad(-year,4);}
function dateParts(epochMs:number,offsetMs:number){
  if(!Number.isFinite(epochMs)||Math.abs(epochMs+offsetMs)>MAX_ABS_EPOCH_MS)throw new Error('时间超出可表示范围。');
  const shifted=new Date(epochMs+offsetMs);
  if(Number.isNaN(shifted.getTime()))throw new Error('时间超出可表示范围。');
  return {
    year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate(),
    hour:shifted.getUTCHours(),minute:shifted.getUTCMinutes(),second:shifted.getUTCSeconds(),
    millisecond:shifted.getUTCMilliseconds(),weekday:['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][shifted.getUTCDay()],
  };
}
function formatDateTimeOffset(epochMs:number,offsetMs:number){
  const p=dateParts(epochMs,offsetMs);
  return `${yearText(p.year)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}
function formatIsoOffset(epochMs:number,offsetMs:number){
  const p=dateParts(epochMs,offsetMs);
  if(offsetMs===0)return `${yearText(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.millisecond,3)}Z`;
  const sign=offsetMs>=0?'+':'-';
  const absolute=Math.abs(offsetMs);
  return `${yearText(p.year)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.millisecond,3)}${sign}${pad(Math.floor(absolute/3600000))}:${pad(Math.floor(absolute%3600000/60000))}`;
}
function formatDuration(totalSeconds:number){
  const safe=Math.max(0,Math.floor(totalSeconds));
  const days=Math.floor(safe/86400),hours=Math.floor(safe%86400/3600),minutes=Math.floor(safe%3600/60),seconds=safe%60;
  if(days>0)return `${days} 天 ${hours} 小时`;
  if(hours>0)return `${hours} 小时 ${minutes} 分钟`;
  if(minutes>0)return `${minutes} 分钟 ${seconds} 秒`;
  return `${seconds} 秒`;
}

/* ---------- JWT 只读解析：不验证签名，不能作为安全判定 ---------- */
export interface JwtTimeClaim{
  name:'iat'|'nbf'|'exp';
  label:string;
  value:number;
  epochMs:number;
  readable:string;
  iso:string;
  note:string;
}
export interface JwtDecodeResult{
  header:Record<string,unknown>;
  payload:Record<string,unknown>;
  claims:JwtTimeClaim[];
  expired:boolean|null;
  notBefore:boolean;
  validNow:boolean;
  signaturePresent:boolean;
  summary:string;
  text:string;
}
function jwtSegmentToObject(segment:string,label:string){
  let bytes:Uint8Array;
  try{bytes=decodeBase64UrlBytes(segment);}catch{throw new Error(`${label}不是有效的 Base64URL 编码。`);}
  let jsonText:string;
  try{jsonText=utf8Decoder.decode(bytes);}catch{throw new Error(`${label}不是有效的 UTF-8 JSON。`);}
  let parsed:unknown;
  try{parsed=JSON.parse(jsonText);}catch{throw new Error(`${label}解码后不是有效 JSON。`);}
  if(!isPlainObject(parsed))throw new Error(`${label}必须是 JSON 对象。`);
  return parsed;
}
const JWT_CLAIMS=[{name:'iat',label:'签发时间 iat'},{name:'nbf',label:'生效时间 nbf'},{name:'exp',label:'过期时间 exp'}] as const;
export function decodeJwt(token:string,now:number=Date.now()):JwtDecodeResult{
  const trimmed=token.trim();
  if(!trimmed)throw new Error('请粘贴 JWT 令牌。');
  if(trimmed.length>MAX_INPUT)throw new Error('JWT 过长，不能超过 25 万字符。');
  const segments=trimmed.split('.');
  if(segments.length!==3)throw new Error('JWT 格式不正确：应由「.」分隔的三段组成（header.payload.signature）。');
  if(!segments[0]||!segments[1])throw new Error('JWT 头部或载荷为空，无法解析。');
  const header=jwtSegmentToObject(segments[0],'JWT 头部');
  const payload=jwtSegmentToObject(segments[1],'JWT 载荷');
  const rawClaims:Record<'iat'|'nbf'|'exp',number|null>={iat:null,nbf:null,exp:null};
  for(const item of JWT_CLAIMS){
    const raw=payload[item.name];
    if(raw===undefined)continue;
    if(typeof raw!=='number'||!Number.isFinite(raw))throw new Error(`JWT 载荷中的 ${item.name} 不是有效的数字时间戳。`);
    if(Math.abs(Math.round(raw*1000))>MAX_ABS_EPOCH_MS)throw new Error(`JWT 载荷中的 ${item.name} 超出可表示的时间范围。`);
    rawClaims[item.name]=raw;
  }
  const claimEpochs:Record<'iat'|'nbf'|'exp',number|null>={iat:null,nbf:null,exp:null};
  for(const item of JWT_CLAIMS){
    const value=rawClaims[item.name];
    if(value!==null)claimEpochs[item.name]=Math.round(value*1000);
  }
  const expired=claimEpochs.exp===null?null:now>=claimEpochs.exp;
  const notBefore=claimEpochs.nbf===null?false:now<claimEpochs.nbf;
  const validNow=expired!==true&&!notBefore;
  const claims:JwtTimeClaim[]=[];
  for(const item of JWT_CLAIMS){
    const value=rawClaims[item.name];
    const epochMs=claimEpochs[item.name];
    if(value===null||epochMs===null)continue;
    let note:string;
    if(item.name==='iat')note=epochMs<=now?`距当前 ${formatDuration((now-epochMs)/1000)}（已过去）`:'晚于当前时间';
    else if(item.name==='nbf')note=notBefore?`还差 ${formatDuration((epochMs-now)/1000)} 生效`:'已生效';
    else note=expired===true?`已过期 ${formatDuration((now-epochMs)/1000)}`:`剩余 ${formatDuration((epochMs-now)/1000)}`;
    claims.push({name:item.name,label:item.label,value,epochMs,readable:formatDateTimeOffset(epochMs,SHANGHAI_OFFSET_MS),iso:formatIsoOffset(epochMs,SHANGHAI_OFFSET_MS),note});
  }
  const summaryParts:string[]=[];
  if(claimEpochs.exp===null)summaryParts.push('未提供 exp，无法判断是否过期');
  else if(expired===true)summaryParts.push(`已过期（超出 ${formatDuration((now-claimEpochs.exp)/1000)}）`);
  else summaryParts.push(`未过期（剩余 ${formatDuration((claimEpochs.exp-now)/1000)}）`);
  if(claimEpochs.nbf!==null)summaryParts.push(notBefore?`当前尚未到 nbf 生效时间（还差 ${formatDuration((claimEpochs.nbf-now)/1000)}）`:'nbf 已生效');
  const summary=summaryParts.join('；')+'。';
  const lines:string[]=[];
  lines.push('== JWT 头部（Header）==',JSON.stringify(header,null,2),'');
  lines.push('== JWT 载荷（Payload）==',JSON.stringify(payload,null,2),'');
  lines.push('== 时间声明（Asia/Shanghai，UTC+08:00）==');
  if(!claims.length)lines.push('未包含 iat / nbf / exp 时间声明。');
  for(const claim of claims)lines.push(`${claim.label}：${claim.value} → ${claim.readable}（${claim.note}）`,`  ISO 8601：${claim.iso}`);
  lines.push('','== 过期状态 ==',`${summary}当前时间：${formatDateTimeOffset(now,SHANGHAI_OFFSET_MS)}（Asia/Shanghai）。`);
  lines.push('','== 安全提示 ==');
  lines.push('本工具只在浏览器本地做 Base64URL 解码与 JSON 格式化：不验证签名，不校验签发方（iss）、受众（aud）或密钥。');
  lines.push(`签名段：${segments[2]?'存在，但未验证':'为空（未提供签名）'}。任何 JWT 都能被解码，解码结果不能用于登录放行、权限或安全判定。`);
  return {header,payload,claims,expired,notBefore,validNow,signaturePresent:segments[2].length>0,summary,text:lines.join('\n')};
}

/* ---------- 密码生成器：仅使用浏览器安全随机数 ---------- */
export type PasswordStrength='弱'|'中'|'强'|'很强';
export interface PasswordOptions{
  length:number;
  lower:boolean;
  upper:boolean;
  digits:boolean;
  symbols:boolean;
  excludeAmbiguous:boolean;
  count:number;
}
export const DEFAULT_PASSWORD_OPTIONS:PasswordOptions={length:16,lower:true,upper:true,digits:true,symbols:false,excludeAmbiguous:false,count:1};
const PASSWORD_LOWER='abcdefghijklmnopqrstuvwxyz';
const PASSWORD_UPPER=PASSWORD_LOWER.toUpperCase();
const PASSWORD_DIGITS='0123456789';
const PASSWORD_SYMBOLS='!@#$%^&*()-_=+[]{};:,.?';
const AMBIGUOUS_CHARS='0OoIl1';
export interface PasswordEntropy{poolSize:number;entropyBits:number;strength:PasswordStrength;length:number;count:number;enabledTypes:number;}
function secureRandomInt(maxExclusive:number){
  if(!Number.isInteger(maxExclusive)||maxExclusive<=0)throw new Error('内部随机范围无效。');
  const cryptoObject=globalThis.crypto;
  if(!cryptoObject?.getRandomValues)throw new Error('当前环境无法使用安全随机数，请通过 HTTPS 访问。');
  const limit=Math.floor(4294967296/maxExclusive)*maxExclusive;
  const buffer=new Uint32Array(1);
  for(let attempt=0;attempt<256;attempt++){
    cryptoObject.getRandomValues(buffer);
    if(buffer[0]<limit)return buffer[0]%maxExclusive;
  }
  throw new Error('无法获取安全随机数，请重试。');
}
function normalizePasswordOptions(options:Partial<PasswordOptions>|undefined){
  const merged={...DEFAULT_PASSWORD_OPTIONS,...options};
  const length=Number(merged.length);
  const count=Number(merged.count);
  if(!Number.isInteger(length)||length<8||length>64)throw new Error('密码长度需为 8–64 的整数。');
  if(!Number.isInteger(count)||count<1||count>10)throw new Error('一次生成数量需为 1–10 的整数。');
  const settings:PasswordOptions={length,count,lower:merged.lower===true,upper:merged.upper===true,digits:merged.digits===true,symbols:merged.symbols===true,excludeAmbiguous:merged.excludeAmbiguous===true};
  const sets=passwordSets(settings);
  if(!sets.length)throw new Error('请至少启用一种字符类型（大写、小写、数字、符号）。');
  if(length<sets.length)throw new Error('密码长度不能小于已启用的字符类型数量。');
  return {settings,sets};
}
function passwordSets(options:PasswordOptions){
  const clean=(value:string)=>options.excludeAmbiguous?[...value].filter(char=>!AMBIGUOUS_CHARS.includes(char)).join(''):value;
  const sets:string[]=[];
  if(options.lower)sets.push(clean(PASSWORD_LOWER));
  if(options.upper)sets.push(clean(PASSWORD_UPPER));
  if(options.digits)sets.push(clean(PASSWORD_DIGITS));
  if(options.symbols)sets.push(clean(PASSWORD_SYMBOLS));
  return sets.filter(set=>set.length>0);
}
export function passwordEntropy(options:Partial<PasswordOptions>|undefined):PasswordEntropy{
  const {settings,sets}=normalizePasswordOptions(options);
  const pool=[...new Set(sets.join(''))].join('');
  const entropyBits=Math.round(Math.log2(pool.length)*settings.length*10)/10;
  const strength:PasswordStrength=entropyBits<50?'弱':entropyBits<80?'中':entropyBits<120?'强':'很强';
  return {poolSize:pool.length,entropyBits,strength,length:settings.length,count:settings.count,enabledTypes:sets.length};
}
export function generatePasswords(options:Partial<PasswordOptions>|undefined):string[]{
  const {settings,sets}=normalizePasswordOptions(options);
  const pool=[...new Set(sets.join(''))].join('');
  const results:string[]=[];
  for(let index=0;index<settings.count;index++){
    const chars:string[]=sets.map(set=>set[secureRandomInt(set.length)]);
    while(chars.length<settings.length)chars.push(pool[secureRandomInt(pool.length)]);
    for(let i=chars.length-1;i>0;i--){
      const j=secureRandomInt(i+1);
      const swap=chars[i];chars[i]=chars[j];chars[j]=swap;
    }
    results.push(chars.join(''));
  }
  return results;
}

/* ---------- UUID v4 ---------- */
export function generateUuidV4(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const cryptoObject=globalThis.crypto;
  if(!cryptoObject?.getRandomValues)throw new Error('当前环境无法安全生成 UUID，请通过 HTTPS 访问。');
  const bytes=cryptoObject.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=hexFromBytes(bytes);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function normalizeUuidCount(value:number|string|undefined){
  const count=value===undefined?1:Number(value);
  if(!Number.isInteger(count)||count<1||count>MAX_UUID_COUNT)throw new Error('UUID 生成数量需为 1–20 的整数。');
  return count;
}
export function generateUuidBatch(count:number|string|undefined=1){
  const safeCount=normalizeUuidCount(count);
  return Array.from({length:safeCount},()=>generateUuidV4());
}

/* ---------- 统一入口 ---------- */
export async function transformDeveloperInput(operation:DevOperation,input:string,options:DeveloperOptions={}):Promise<string>{
  switch(operation){
    case 'uuid':
      return generateUuidBatch(options.uuidCount).join('\n');
    case 'password':
      return generatePasswords(options.password).join('\n');
    case 'jwt-decode':
      return decodeJwt(input).text;
    default:
      break;
  }
  validateTextInput(input);
  switch(operation){
    case 'json-pretty': return JSON.stringify(JSON.parse(input),null,2);
    case 'json-minify': return JSON.stringify(JSON.parse(input));
    case 'base64-encode': return encodeUtf8Base64(input);
    case 'base64-decode': return decodeUtf8Base64(input);
    case 'base64url-encode': return encodeBase64Url(input);
    case 'base64url-decode': return decodeBase64Url(input);
    case 'url-encode': return encodeURIComponent(input);
    case 'url-decode': try{return decodeURIComponent(input);}catch{throw new Error('URL 百分号编码不完整或 UTF-8 无效。');}
    case 'md5': return md5Hex(input);
    case 'sha1': return hashHex('SHA-1',input);
    case 'sha256': return hashHex('SHA-256',input);
    case 'sha384': return hashHex('SHA-384',input);
    case 'sha512': return hashHex('SHA-512',input);
    case 'hmac-sha256': return hmacSha256Hex(options.hmacKeyHex??'',input);
  }
}
