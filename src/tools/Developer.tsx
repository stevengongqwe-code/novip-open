import {useState} from 'react';
import {copyLocal} from '../tool-common';
import {ToolPage,useJob,textDownload} from './common';
import { useI18n } from '../i18n';
import {
  DEFAULT_PASSWORD_OPTIONS,
  decodeJwt,
  generatePasswords,
  passwordEntropy,
  transformDeveloperInput,
  type DevOperation,
  type JwtDecodeResult,
  type PasswordEntropy,
  type PasswordOptions,
} from './developer-core';
import './developer.css';

type OperationGroup='文本与编码'|'摘要与校验'|'解析与生成';
const operations:{value:DevOperation;label:string;group:OperationGroup;runLabel:string}[]=[
  {value:'json-pretty',label:'JSON 格式化',group:'文本与编码',runLabel:'开始处理'},
  {value:'json-minify',label:'JSON 压缩',group:'文本与编码',runLabel:'开始处理'},
  {value:'base64-encode',label:'文本 → Base64（UTF-8）',group:'文本与编码',runLabel:'开始处理'},
  {value:'base64-decode',label:'Base64 → 文本（UTF-8）',group:'文本与编码',runLabel:'开始处理'},
  {value:'base64url-encode',label:'文本 → Base64 URL-safe',group:'文本与编码',runLabel:'开始处理'},
  {value:'base64url-decode',label:'Base64 URL-safe → 文本',group:'文本与编码',runLabel:'开始处理'},
  {value:'url-encode',label:'URL 参数编码',group:'文本与编码',runLabel:'开始处理'},
  {value:'url-decode',label:'URL 参数解码',group:'文本与编码',runLabel:'开始处理'},
  {value:'md5',label:'MD5 摘要（校验用）',group:'摘要与校验',runLabel:'计算摘要'},
  {value:'sha1',label:'SHA-1 摘要',group:'摘要与校验',runLabel:'计算摘要'},
  {value:'sha256',label:'SHA-256 摘要',group:'摘要与校验',runLabel:'计算摘要'},
  {value:'sha384',label:'SHA-384 摘要',group:'摘要与校验',runLabel:'计算摘要'},
  {value:'sha512',label:'SHA-512 摘要',group:'摘要与校验',runLabel:'计算摘要'},
  {value:'hmac-sha256',label:'HMAC-SHA256（十六进制密钥）',group:'摘要与校验',runLabel:'计算 HMAC'},
  {value:'jwt-decode',label:'JWT 只读解析（不验证签名）',group:'解析与生成',runLabel:'解析 JWT'},
  {value:'password',label:'密码生成器（安全随机）',group:'解析与生成',runLabel:'生成密码'},
  {value:'uuid',label:'生成 UUID v4（1–20 条）',group:'解析与生成',runLabel:'生成 UUID'},
];
const groups:[...OperationGroup[]]=[...new Set(operations.map(item=>item.group))];
const placeholders:Partial<Record<DevOperation,string>>={
  'jwt-decode':'粘贴 JWT，例如 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJub3ZpcCJ9.xxxxx（仅解码，不验证签名）',
};
const downloadNames:Partial<Record<DevOperation,string>>={
  'jwt-decode':'novip-jwt-decode.txt',
  password:'novip-passwords.txt',
  uuid:'novip-uuid.txt',
};
const uuidCounts=Array.from({length:20},(_,index)=>String(index+1));
export default function Developer(){
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const job=useJob();
  const [operation,setOperation]=useState<DevOperation>('json-pretty');
  const [input,setInput]=useState('');
  const [output,setOutput]=useState('');
  const [jwt,setJwt]=useState<JwtDecodeResult|null>(null);
  const [hmacKey,setHmacKey]=useState('');
  const [uuidCount,setUuidCount]=useState('1');
  const [passwordLength,setPasswordLength]=useState(String(DEFAULT_PASSWORD_OPTIONS.length));
  const [passwordCount,setPasswordCount]=useState(String(DEFAULT_PASSWORD_OPTIONS.count));
  const [passwordLower,setPasswordLower]=useState(DEFAULT_PASSWORD_OPTIONS.lower);
  const [passwordUpper,setPasswordUpper]=useState(DEFAULT_PASSWORD_OPTIONS.upper);
  const [passwordDigits,setPasswordDigits]=useState(DEFAULT_PASSWORD_OPTIONS.digits);
  const [passwordSymbols,setPasswordSymbols]=useState(DEFAULT_PASSWORD_OPTIONS.symbols);
  const [passwordExcludeAmbiguous,setPasswordExcludeAmbiguous]=useState(DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous);
  const current=operations.find(item=>item.value===operation)!;
  const needsText=operation!=='password'&&operation!=='uuid';
  const passwordOptions:Partial<PasswordOptions>={
    length:Number(passwordLength),count:Number(passwordCount),
    lower:passwordLower,upper:passwordUpper,digits:passwordDigits,symbols:passwordSymbols,excludeAmbiguous:passwordExcludeAmbiguous,
  };
  let passwordInfo:PasswordEntropy|null=null;
  if(operation==='password')try{passwordInfo=passwordEntropy(passwordOptions);}catch{passwordInfo=null;}
  const clearResult=()=>{setOutput('');setJwt(null);job.reset();};
  const changeOperation=(next:DevOperation)=>{setOperation(next);clearResult();};
  const run=()=>{
    if(operation==='password'){
      void job.run(async()=>generatePasswords(passwordOptions).join('\n'),text=>{setOutput(text);setJwt(null);});
      return;
    }
    if(operation==='jwt-decode'){
      void job.run(async()=>decodeJwt(input),result=>{setOutput(result.text);setJwt(result);});
      return;
    }
    void job.run(()=>transformDeveloperInput(operation,input,{hmacKeyHex:hmacKey,uuidCount}),text=>{setOutput(text);setJwt(null);});
  };
  const copyResult=async()=>{
    try{await copyLocal(output);job.setStatus('已复制到剪贴板。');}
    catch(error){job.setError(error instanceof Error?error.message:'复制失败，请手动选择结果。');}
  };
  const downloadResult=()=>{
    try{textDownload(output,downloadNames[operation]??'novip-developer-result.txt');job.setStatus('已开始下载。');}
    catch(error){job.setError(error instanceof Error?error.message:'下载失败，请重试。');}
  };
  const resetAll=()=>{
    job.reset();
    setInput('');setOutput('');setJwt(null);setHmacKey('');setUuidCount('1');
    setPasswordLength(String(DEFAULT_PASSWORD_OPTIONS.length));
    setPasswordCount(String(DEFAULT_PASSWORD_OPTIONS.count));
    setPasswordLower(DEFAULT_PASSWORD_OPTIONS.lower);
    setPasswordUpper(DEFAULT_PASSWORD_OPTIONS.upper);
    setPasswordDigits(DEFAULT_PASSWORD_OPTIONS.digits);
    setPasswordSymbols(DEFAULT_PASSWORD_OPTIONS.symbols);
    setPasswordExcludeAmbiguous(DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous);
  };
  return <ToolPage
    id="developer"
    title={isEn ? "Developer & Text Toolkit" : "开发者与文本工具箱"}
    description={isEn
      ? "JSON, Base64/Base64URL, URL, MD5/SHA/HMAC hashing, read-only JWT decode, secure passwords and batch UUIDs; 100% in-browser offline processing, no registration required."
      : "JSON、Base64/Base64URL、URL、MD5/SHA/HMAC 摘要、JWT 只读解析、安全密码与批量 UUID；全部在浏览器本地处理，不联网、无需注册。"}
    job={job}
  >
    <section className="study-card">
      <label>{isEn ? "Select Feature" : "选择功能"}<select value={operation} onChange={event=>changeOperation(event.target.value as DevOperation)}>{groups.map(group=><optgroup key={group} label={isEn ? (group === '文本与编码' ? 'Text & Encodings' : group === '摘要与校验' ? 'Hashes & Checksums' : 'Parsing & Generators') : group}>{operations.filter(item=>item.group===group).map(item=><option key={item.value} value={item.value}>{isEn ? (item.value === 'json-pretty' ? 'JSON Prettify' : item.value === 'json-minify' ? 'JSON Minify' : item.value === 'base64-encode' ? 'Text → Base64 (UTF-8)' : item.value === 'base64-decode' ? 'Base64 → Text (UTF-8)' : item.value === 'base64url-encode' ? 'Text → Base64 URL-safe' : item.value === 'base64url-decode' ? 'Base64 URL-safe → Text' : item.value === 'url-encode' ? 'URL Param Encode' : item.value === 'url-decode' ? 'URL Param Decode' : item.value === 'md5' ? 'MD5 Hash' : item.value === 'sha1' ? 'SHA-1 Hash' : item.value === 'sha256' ? 'SHA-256 Hash' : item.value === 'sha384' ? 'SHA-384 Hash' : item.value === 'sha512' ? 'SHA-512 Hash' : item.value === 'hmac-sha256' ? 'HMAC-SHA256 (Hex key)' : item.value === 'jwt-decode' ? 'JWT Read-only Decode' : item.value === 'password' ? 'Password Generator (Secure Random)' : 'Generate UUID v4 (1–20)') : item.label}</option>)}</optgroup>)}</select></label>
      {needsText&&<label>{operation==='jwt-decode'?(isEn ? 'JWT Token (header.payload.signature)' : 'JWT 令牌（header.payload.signature）'):(isEn ? 'Input Content' : '输入内容')}<textarea aria-label={operation==='jwt-decode'?'JWT 令牌':'待处理文本'} rows={operation==='jwt-decode'?6:8} maxLength={250000} value={input} onChange={event=>{setInput(event.target.value);clearResult();}} placeholder={placeholders[operation]??(isEn ? 'Enter or paste text here (up to 250,000 characters)' : '在此输入或粘贴文本（最多 25 万字符）')} spellCheck={false}/></label>}
      {operation==='hmac-sha256'&&<label>{isEn ? "HMAC Key (Hexadecimal)" : "HMAC 密钥（十六进制）"}<input aria-label="HMAC 十六进制密钥" value={hmacKey} maxLength={1024} autoComplete="off" spellCheck={false} onChange={event=>{setHmacKey(event.target.value);clearResult();}} placeholder={isEn ? "e.g. 6b6579; used in-memory only, never saved" : "例如 6b6579；只在本页内存使用，不会保存"}/></label>}
      {operation==='jwt-decode'&&<p className="dev-warning" role="note">{isEn ? "JWT is read-only decoded: signature is NOT verified, and issuer/audience are not validated. Cannot be used for authentication or authorization decisions." : "JWT 仅做只读解码：不验证签名，也不校验签发方或受众，不能作为登录放行、权限或任何安全判定依据。令牌可能含敏感信息，请勿粘贴他人令牌。"}</p>}
      {operation==='password'&&<div className="dev-password">
        <div className="study-fields">
          <label>{isEn ? "Password Length (8–64)" : "密码长度（8–64）"}<input aria-label="密码长度" type="number" inputMode="numeric" min={8} max={64} value={passwordLength} onChange={event=>{setPasswordLength(event.target.value);clearResult();}}/></label>
          <label>{isEn ? "Quantity (1–10)" : "生成数量（1–10）"}<input aria-label="密码生成数量" type="number" inputMode="numeric" min={1} max={10} value={passwordCount} onChange={event=>{setPasswordCount(event.target.value);clearResult();}}/></label>
        </div>
        <div className="dev-checks" role="group" aria-label={isEn ? "Password character types" : "密码字符类型"}>
          <label className="study-check"><input type="checkbox" checked={passwordLower} onChange={event=>{setPasswordLower(event.target.checked);clearResult();}}/>{isEn ? "Lowercase a–z" : "小写字母 a–z"}</label>
          <label className="study-check"><input type="checkbox" checked={passwordUpper} onChange={event=>{setPasswordUpper(event.target.checked);clearResult();}}/>{isEn ? "Uppercase A–Z" : "大写字母 A–Z"}</label>
          <label className="study-check"><input type="checkbox" checked={passwordDigits} onChange={event=>{setPasswordDigits(event.target.checked);clearResult();}}/>{isEn ? "Digits 0–9" : "数字 0–9"}</label>
          <label className="study-check"><input type="checkbox" checked={passwordSymbols} onChange={event=>{setPasswordSymbols(event.target.checked);clearResult();}}/>{isEn ? "Symbols !@#$%…" : "符号 !@#$%…"}</label>
          <label className="study-check"><input type="checkbox" checked={passwordExcludeAmbiguous} onChange={event=>{setPasswordExcludeAmbiguous(event.target.checked);clearResult();}}/>{isEn ? "Exclude ambiguous characters (0 O o I l 1)" : "排除易混字符 0 O o I l 1"}</label>
        </div>
        {passwordInfo
          ?<div className="dev-readout" aria-live="polite">
            <div><strong>{isEn ? "Pool Size" : "字符池"}</strong><span className="dev-value">{isEn ? `${passwordInfo.poolSize} characters` : `${passwordInfo.poolSize} 个字符`}</span></div>
            <div><strong>{isEn ? "Entropy" : "单条熵值"}</strong><span className="dev-value">{isEn ? `~${passwordInfo.entropyBits} bits` : `约 ${passwordInfo.entropyBits} 位`}</span></div>
            <div><strong>{isEn ? "Strength" : "强度参考"}</strong><span className="dev-value">{passwordInfo.strength}</span></div>
          </div>
          :<p className="study-message">{isEn ? "Please configure valid length, count, and enable at least one character type." : "请先设置有效的长度、数量，并至少启用一种字符类型。"}</p>}
        <p className="study-note">{isEn ? "Generated with browser crypto.getRandomValues; passwords exist in memory only and are never saved or uploaded. Copy and store securely." : "使用浏览器 crypto.getRandomValues 生成；密码只在本页内存出现，不会保存或上传，离开页面即丢失，请立即复制并妥善保管。"}</p>
      </div>}
      {operation==='uuid'&&<label>{isEn ? "Number of UUIDs" : "生成条数"}<select aria-label="UUID 生成条数" value={uuidCount} onChange={event=>{setUuidCount(event.target.value);clearResult();}}>{uuidCounts.map(count=><option key={count} value={count}>{count} {isEn ? (count === '1' ? 'item' : 'items') : '条'}</option>)}</select></label>}
      <div className="study-actions">
        <button className="study-btn" disabled={job.busy} onClick={()=>void run()}>{job.busy?(isEn ? 'Processing…' : '处理中…'):(isEn ? (operation === 'password' ? 'Generate Password' : operation === 'uuid' ? 'Generate UUID' : operation.startsWith('md5') || operation.startsWith('sha') ? 'Calculate Hash' : operation === 'hmac-sha256' ? 'Calculate HMAC' : operation === 'jwt-decode' ? 'Decode JWT' : 'Process') : current.runLabel)}</button>
        <button className="study-btn alt" onClick={resetAll}>{isEn ? "Reset" : "重置"}</button>
      </div>
    </section>
    {jwt&&<section className="study-card dev-jwt">
      <h2>{isEn ? "JWT Decode Result" : "JWT 解析结果"}</h2>
      <div className="dev-badge-row">
        <span className={['dev-badge',jwt.expired===true?'bad':jwt.validNow?'good':''].filter(Boolean).join(' ')}>{jwt.expired===true?(isEn ? 'Expired' : '已过期'):jwt.expired===false?(isEn ? 'Not Expired' : '未过期'):(isEn ? 'No exp claim' : '无 exp 声明')}</span>
        <span className={['dev-badge',jwt.notBefore?'bad':'good'].filter(Boolean).join(' ')}>{jwt.notBefore?(isEn ? 'Not yet active' : '尚未生效'):(isEn ? 'Time conditions met' : '时间条件满足')}</span>
        <span className="dev-badge">{isEn ? `Alg ${String(jwt.header.alg??'unspecified')}` : `算法 ${String(jwt.header.alg??'未标注')}`}</span>
        <span className="dev-badge">{jwt.signaturePresent?(isEn ? 'Signature Present (Unverified)' : '签名段存在（未验证）'):(isEn ? 'No Signature' : '无签名段')}</span>
      </div>
      <p className="dev-warning" role="note">{isEn ? "Decode only: Signature is NOT verified. Does not indicate token validity. Do not use for authentication or security decisions." : "仅解码：不验证签名，不代表令牌有效；不要把解码结果用于登录放行、权限判断或任何安全决策。"}</p>
      {jwt.claims.length
        ?<div className="dev-readout">{jwt.claims.map(claim=><div key={claim.name}><strong>{claim.label}</strong><span className="dev-value">{claim.readable}</span><span className="dev-meta">{claim.note}</span></div>)}</div>
        :<p className="study-message">{isEn ? "No iat / nbf / exp time claims found in payload." : "载荷中没有 iat / nbf / exp 时间声明。"}</p>}
      <p className="study-message" role="status">{isEn ? `Expiration Status: ${jwt.summary}` : `过期状态：${jwt.summary}`}</p>
    </section>}
    {output&&<section className="study-card">
      <label>{isEn ? "Result" : "结果"}<textarea aria-label="处理结果" rows={operation==='password'?7:9} readOnly value={output} spellCheck={false}/></label>
      <div className="study-actions">
        <button className="study-btn alt" onClick={()=>void copyResult()}>{isEn ? "Copy Result" : "复制结果"}</button>
        <button className="study-btn alt" onClick={downloadResult}>{isEn ? "Download TXT" : "下载 TXT"}</button>
      </div>
    </section>}
    <p className="study-note">{isEn ? "Tip: MD5/SHA-1 are for file integrity only and should not be used for password storage or authentication; JWT is decoded without signature verification; passwords and UUIDs rely on crypto.getRandomValues in HTTPS. 100% processed locally in memory." : "提示：MD5/SHA-1 仅适合文件完整性校验，不能用于口令存储或安全认证；JWT 只解码不验证签名；密码与 UUID 依赖浏览器安全随机数，请在 HTTPS 页面使用。所有内容只在本页内存处理，刷新或重置即清空。"}</p>
  </ToolPage>;
}
