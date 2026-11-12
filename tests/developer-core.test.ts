import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {
  decodeBase64Url,
  decodeJwt,
  encodeBase64Url,
  generatePasswords,
  generateUuidBatch,
  hashHex,
  hmacSha256Hex,
  md5Hex,
  passwordEntropy,
  transformDeveloperInput,
  MAX_INPUT,
  type HashAlgorithm,
  type PasswordOptions,
} from '../src/tools/developer-core';

const nodeDigest=(algorithm:string,text:string)=>createHash(algorithm).update(text,'utf8').digest('hex');
const nodeHmac=(hexKey:string,text:string)=>createHmac('sha256',Buffer.from(hexKey,'hex')).update(text,'utf8').digest('hex');
const base64UrlJson=(value:unknown)=>Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
const makeJwt=(header:unknown,payload:unknown,signature='sig')=>`${base64UrlJson(header)}.${base64UrlJson(payload)}.${signature}`;
const UUID_V4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

describe('NOVIP 独立开发者工具',()=>{
  it('JSON 美化/压缩往返且不执行脚本',async()=>{
    const pretty=await transformDeveloperInput('json-pretty','{"a":1,"b":[2,3]}');
    assert.equal(JSON.parse(pretty).b[1],3);
    assert.equal(await transformDeveloperInput('json-minify',pretty),'{"a":1,"b":[2,3]}');
    await assert.rejects(transformDeveloperInput('json-pretty','{oops}'));
  });
  it('UTF-8 中文及 emoji Base64 往返',async()=>{
    const s='大学生，别花冤枉钱。🚀';
    const encoded=await transformDeveloperInput('base64-encode',s);
    assert.equal(await transformDeveloperInput('base64-decode',encoded),s);
    await assert.rejects(transformDeveloperInput('base64-decode','!!!!'));
    await assert.rejects(transformDeveloperInput('base64-decode','//4='));
  });
  it('URL 参数编码往返',async()=>{
    const s='甘肃 农业&AI=?';
    assert.equal(await transformDeveloperInput('url-decode',await transformDeveloperInput('url-encode',s)),s);
    await assert.rejects(transformDeveloperInput('url-decode','%ZZ'));
  });
  it('SHA-256 符合标准测试向量',async()=>{
    assert.equal(await transformDeveloperInput('sha256','abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('限制超长输入',async()=>{
    await assert.rejects(transformDeveloperInput('url-encode','A'.repeat(250001)));
    await assert.rejects(transformDeveloperInput('md5','A'.repeat(MAX_INPUT+1)));
  });
  it('UUID v4 使用安全随机 API',async()=>{
    assert.match(await transformDeveloperInput('uuid',''),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
});

describe('新增：MD5 纯 TypeScript 实现',()=>{
  it('RFC 1321 标准向量与 node:crypto 一致',()=>{
    assert.equal(md5Hex(''),'d41d8cd98f00b204e9800998ecf8427e');
    assert.equal(md5Hex('abc'),'900150983cd24fb0d6963f7d28e17f72');
    assert.equal(md5Hex('The quick brown fox jumps over the lazy dog'),'9e107d9d372bb6826bd81d3542a419d6');
    for(const text of ['大学生，别花冤枉钱。🚀','甘肃 农业&AI=?','', 'a'.repeat(10000)])assert.equal(md5Hex(text),nodeDigest('md5',text),text.slice(0,24));
  });
  it('覆盖 64 字节分组填充边界与多字节中文',()=>{
    for(const length of [0,1,54,55,56,57,63,64,65,119,120,127,128,129]){
      assert.equal(md5Hex('x'.repeat(length)),nodeDigest('md5','x'.repeat(length)),`ascii 长度 ${length}`);
      assert.equal(md5Hex('安'.repeat(length)),nodeDigest('md5','安'.repeat(length)),`中文长度 ${length}`);
    }
  });
  it('MD5 是校验摘要而不是加密，文本不变得到同一结果',async()=>{
    assert.equal(await transformDeveloperInput('md5','abc'),await transformDeveloperInput('md5','abc'));
    assert.notEqual(await transformDeveloperInput('md5','abc'),await transformDeveloperInput('md5','abd'));
    await assert.rejects(transformDeveloperInput('md5',''));
  });
});

describe('新增：Web Crypto 哈希与 HMAC-SHA256',()=>{
  it('SHA-1/SHA-256/SHA-384/SHA-512 与 node:crypto 一致',async()=>{
    const algorithms:[HashAlgorithm,string][]=[['SHA-1','sha1'],['SHA-256','sha256'],['SHA-384','sha384'],['SHA-512','sha512']];
    for(const [algorithm,nodeName] of algorithms){
      for(const text of ['','abc','大学生，别花冤枉钱。🚀'])assert.equal(await hashHex(algorithm,text),nodeDigest(nodeName,text),`${algorithm}: ${text}`);
    }
  });
  it('transform 入口支持全部摘要操作',async()=>{
    assert.equal(await transformDeveloperInput('sha1','abc'),nodeDigest('sha1','abc'));
    assert.equal(await transformDeveloperInput('sha256','abc'),nodeDigest('sha256','abc'));
    assert.equal(await transformDeveloperInput('sha384','abc'),nodeDigest('sha384','abc'));
    assert.equal(await transformDeveloperInput('sha512','abc'),nodeDigest('sha512','abc'));
  });
  it('HMAC-SHA256 与 node:crypto 一致',async()=>{
    const key='6b6579';
    assert.equal(await hmacSha256Hex(key,'The quick brown fox jumps over the lazy dog'),nodeHmac(key,'The quick brown fox jumps over the lazy dog'));
    assert.equal(await hmacSha256Hex('00ff','中文消息'),nodeHmac('00ff','中文消息'));
    assert.equal(await transformDeveloperInput('hmac-sha256','abc',{hmacKeyHex:key}),nodeHmac(key,'abc'));
  });
  it('HMAC 密钥必须是偶数位十六进制',async()=>{
    await assert.rejects(transformDeveloperInput('hmac-sha256','abc',{hmacKeyHex:''}),/密钥/);
    await assert.rejects(transformDeveloperInput('hmac-sha256','abc',{hmacKeyHex:'abc'}),/十六进制/);
    await assert.rejects(transformDeveloperInput('hmac-sha256','abc',{hmacKeyHex:'zz'}),/十六进制/);
    await assert.rejects(transformDeveloperInput('hmac-sha256',''  ,{hmacKeyHex:'6b6579'}),/内容/);
  });
});

describe('新增：Base64 URL-safe',()=>{
  it('编码只含 URL 安全字符且可往返解码（含中文和特殊字符）',async()=>{
    for(const text of ['a','你好，世界','???>>>','大学生，别花冤枉钱。🚀','ûÿ']){
      const encoded=encodeBase64Url(text);
      assert.match(encoded,/^[A-Za-z0-9_-]*$/);
      assert.equal(decodeBase64Url(encoded),text);
      assert.equal(await transformDeveloperInput('base64url-encode',text),encoded);
      assert.equal(await transformDeveloperInput('base64url-decode',encoded),text);
    }
  });
  it('与标准 Base64 保持 +/ 到 -_ 的替换关系',()=>{
    const samples=['\u0000¾','\u0000¿'];
    assert.match(Buffer.from(samples[0],'utf8').toString('base64'),/\+/);
    assert.match(Buffer.from(samples[1],'utf8').toString('base64'),/\//);
    for(const sample of samples){
      const standard=Buffer.from(sample,'utf8').toString('base64');
      assert.equal(encodeBase64Url(sample),standard.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));
    }
  });
  it('解码接受标准 Base64 字母表与补位，拒绝非法输入',()=>{
    const standard=Buffer.from('你好','utf8').toString('base64');
    assert.equal(decodeBase64Url(standard),'你好');
    assert.throws(()=>decodeBase64Url('!!!!'),/Base64 URL-safe/);
    assert.throws(()=>decodeBase64Url('a'),/Base64 URL-safe/);
    assert.throws(()=>decodeBase64Url(''),/内容/);
  });
});

describe('新增：JWT 只读解析',()=>{
  const NOW=Date.UTC(2026,9,24,13,47,44);
  const nowSeconds=Math.floor(NOW/1000);
  it('解析 header/payload 并格式化 iat/exp/nbf',()=>{
    const token=makeJwt({alg:'HS256',typ:'JWT'},{sub:'vue',name:'测试',iat:1700000000,exp:nowSeconds+3600,nbf:nowSeconds-10});
    const result=decodeJwt(token,NOW);
    assert.equal(result.header.alg,'HS256');
    assert.equal(result.payload.sub,'vue');
    assert.equal(result.payload.name,'测试');
    assert.equal(result.expired,false);
    assert.equal(result.notBefore,false);
    assert.equal(result.validNow,true);
    assert.equal(result.signaturePresent,true);
    assert.equal(result.claims.length,3);
    const iat=result.claims.find(claim=>claim.name==='iat');
    const exp=result.claims.find(claim=>claim.name==='exp');
    assert.equal(iat?.readable,'2023-11-15 06:13:20');
    assert.equal(iat?.iso,'2023-11-15T06:13:20.000+08:00');
    assert.equal(exp?.readable,'2026-10-24 22:47:44');
    assert.equal(exp?.note,'剩余 1 小时 0 分钟');
    assert.match(result.summary,/未过期/);
    assert.match(result.text,/不验证签名/);
    assert.match(result.text,/HS256/);
    assert.match(result.text,/2023-11-15 06:13:20/);
  });
  it('识别已过期与尚未生效的令牌',()=>{
    const expired=decodeJwt(makeJwt({alg:'HS256'},{exp:nowSeconds-60}),NOW);
    assert.equal(expired.expired,true);
    assert.equal(expired.validNow,false);
    assert.match(expired.summary,/已过期/);
    const future=decodeJwt(makeJwt({alg:'HS256'},{nbf:nowSeconds+600}),NOW);
    assert.equal(future.expired,null);
    assert.equal(future.notBefore,true);
    assert.equal(future.validNow,false);
    assert.match(future.summary,/尚未到 nbf/);
    assert.match(future.text,/未提供 exp/);
  });
  it('签名段为空时明确提示未验证',()=>{
    const token=`${base64UrlJson({alg:'none'})}.${base64UrlJson({sub:'a'})}.`;
    const result=decodeJwt(token,NOW);
    assert.equal(result.signaturePresent,false);
    assert.match(result.text,/为空（未提供签名）/);
  });
  it('非法输入给出中文错误',()=>{
    assert.throws(()=>decodeJwt('',NOW),/请粘贴 JWT/);
    assert.throws(()=>decodeJwt('a.b',NOW),/三段/);
    assert.throws(()=>decodeJwt('a.b.c.d',NOW),/三段/);
    assert.throws(()=>decodeJwt(`a.${base64UrlJson({})}.sig`,NOW),/Base64URL/);
    assert.throws(()=>decodeJwt(`${Buffer.from('not-json','utf8').toString('base64url')}.${base64UrlJson({})}.sig`,NOW),/JSON/);
    assert.throws(()=>decodeJwt(`${base64UrlJson(['a'])}.${base64UrlJson({})}.sig`,NOW),/JSON 对象/);
    assert.throws(()=>decodeJwt(makeJwt({alg:'HS256'},{exp:'soon'}),NOW),/exp/);
  });
});

describe('新增：密码生成器',()=>{
  const allTypes:Partial<PasswordOptions>={length:64,lower:true,upper:true,digits:true,symbols:true,count:3};
  it('长度、数量与字符类型符合设置',()=>{
    const passwords=generatePasswords(allTypes);
    assert.equal(passwords.length,3);
    const allowed='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,.?';
    for(const password of passwords){
      assert.equal(password.length,64);
      assert.ok([...password].every(char=>allowed.includes(char)),password);
      assert.ok([...password].some(char=>/[a-z]/.test(char)));
      assert.ok([...password].some(char=>/[A-Z]/.test(char)));
      assert.ok([...password].some(char=>/[0-9]/.test(char)));
      assert.ok([...password].some(char=>'!@#$%^&*()-_=+[]{};:,.?'.includes(char)));
    }
  });
  it('只启用一类字符时只输出该类字符',()=>{
    const passwords=generatePasswords({length:12,lower:true,upper:false,digits:false,symbols:false,count:2});
    for(const password of passwords)assert.match(password,/^[a-z]{12}$/);
  });
  it('可排除易混字符 0 O o I l 1',()=>{
    const passwords=generatePasswords({...allTypes,length:64,count:10,excludeAmbiguous:true});
    for(const password of passwords){
      for(const char of '0OoIl1')assert.equal(password.includes(char),false,`不应包含 ${char}`);
    }
  });
  it('熵值与强度基于字符池计算',()=>{
    const info=passwordEntropy({length:16,lower:true,upper:true,digits:true,symbols:true});
    assert.equal(info.poolSize,85);
    assert.equal(info.entropyBits,Math.round(Math.log2(85)*16*10)/10);
    assert.equal(info.strength,'强');
    assert.equal(passwordEntropy({length:8,lower:true,upper:false,digits:false,symbols:false}).strength,'弱');
    assert.equal(passwordEntropy({...allTypes,length:32}).strength,'很强');
  });
  it('每次生成使用新的安全随机数',()=>{
    const first=generatePasswords({...allTypes,count:5}).join('|');
    const second=generatePasswords({...allTypes,count:5}).join('|');
    assert.notEqual(first,second);
  });
  it('长度与数量有中文范围错误',()=>{
    assert.throws(()=>generatePasswords({length:7}),/8–64/);
    assert.throws(()=>generatePasswords({length:65}),/8–64/);
    assert.throws(()=>generatePasswords({length:7.5}),/8–64/);
    assert.throws(()=>generatePasswords({count:0}),/1–10/);
    assert.throws(()=>generatePasswords({count:11}),/1–10/);
    assert.throws(()=>generatePasswords({length:12,lower:false,upper:false,digits:false,symbols:false}),/至少启用/);
  });
  it('transform 入口返回多行密码且不需要输入文本',async()=>{
    const output=await transformDeveloperInput('password','',{password:{length:20,count:2,lower:true,upper:true,digits:true,symbols:false}});
    assert.equal(output.split('\n').length,2);
    for(const line of output.split('\n'))assert.equal(line.length,20);
    await assert.rejects(transformDeveloperInput('password','',{password:{length:4}}));
  });
});

describe('新增：UUID 批量生成',()=>{
  it('默认 1 条、可生成 1–20 条且互不重复',async()=>{
    assert.match(await transformDeveloperInput('uuid',''),UUID_V4);
    const batch=(await transformDeveloperInput('uuid','',{uuidCount:5})).split('\n');
    assert.equal(batch.length,5);
    for(const uuid of batch)assert.match(uuid,UUID_V4);
    assert.equal(new Set(batch).size,5);
    assert.equal(generateUuidBatch(20).length,20);
  });
  it('数量越界给出中文错误',async()=>{
    await assert.rejects(transformDeveloperInput('uuid','',{uuidCount:0}),/1–20/);
    await assert.rejects(transformDeveloperInput('uuid','',{uuidCount:21}),/1–20/);
    await assert.rejects(transformDeveloperInput('uuid','',{uuidCount:'1.5'}),/1–20/);
  });
});

describe('新增：输入上限与无网络约束',()=>{
  it('新增文本操作同样限制 25 万字符',async()=>{
    await assert.rejects(transformDeveloperInput('md5','A'.repeat(MAX_INPUT+1)),/25 万/);
    await assert.rejects(transformDeveloperInput('jwt-decode','A'.repeat(MAX_INPUT+1)),/25 万/);
    assert.equal((await transformDeveloperInput('base64url-encode','A'.repeat(MAX_INPUT))).length>0,true);
  });
  it('所有变换均可离线同步完成（不访问网络）',async()=>{
    const operations=['json-pretty','base64url-encode','url-encode','md5','sha256'] as const;
    for(const operation of operations)assert.equal(typeof await transformDeveloperInput(operation,'{"a":"NOVIP"}'),'string');
  });
});
