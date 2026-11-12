import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PASSWORD_OPTIONS,
  generatePasswords,
  passwordEntropy,
  transformDeveloperInput,
  type PasswordOptions,
} from '../src/tools/developer-core';

// 锁定的默认选项：开发者工具密码生成器的初始 UI 状态（Developer.tsx）
// 与 normalizePasswordOptions 的合并基线。改动任一字段都会同时改 UI
// 初始值与无参生成的行为，故在此逐项锁定。
const EXPECTED_DEFAULTS:PasswordOptions={length:16,lower:true,upper:true,digits:true,symbols:false,excludeAmbiguous:false,count:1};
const DEFAULT_ALLOWED='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SYMBOLS='!@#$%^&*()-_=+[]{};:,.?';

describe('密码生成器默认选项契约',()=>{
  it('字面值逐项锁定：16 位、小写+大写+数字、无符号、不排除易混字符、1 条',()=>{
    assert.deepEqual(DEFAULT_PASSWORD_OPTIONS,EXPECTED_DEFAULTS);
    assert.equal(Object.keys(DEFAULT_PASSWORD_OPTIONS).length,7);
  });

  it('取值域：长度在 8–64 内、数量在 1–10 内',()=>{
    assert.ok(DEFAULT_PASSWORD_OPTIONS.length>=8&&DEFAULT_PASSWORD_OPTIONS.length<=64);
    assert.ok(DEFAULT_PASSWORD_OPTIONS.count>=1&&DEFAULT_PASSWORD_OPTIONS.count<=10);
    assert.equal(DEFAULT_PASSWORD_OPTIONS.lower,true);
    assert.equal(DEFAULT_PASSWORD_OPTIONS.upper,true);
    assert.equal(DEFAULT_PASSWORD_OPTIONS.digits,true);
    assert.equal(DEFAULT_PASSWORD_OPTIONS.symbols,false);
    assert.equal(DEFAULT_PASSWORD_OPTIONS.excludeAmbiguous,false);
  });

  it('无参熵值锁定：字符池 62、熵 95.3、强度“强”、16 位、1 条、3 类',()=>{
    const info=passwordEntropy(undefined);
    assert.deepEqual(info,{poolSize:62,entropyBits:95.3,strength:'强',length:16,count:1,enabledTypes:3});
    assert.equal(info.entropyBits,Math.round(Math.log2(62)*16*10)/10);
  });

  it('三路等价：无参 ≡ {} ≡ 传入常量',()=>{
    assert.deepEqual(passwordEntropy(undefined),passwordEntropy({}));
    assert.deepEqual(passwordEntropy(undefined),passwordEntropy(DEFAULT_PASSWORD_OPTIONS));
  });

  it('无参生成：1 条 16 位、每类至少 1 个、仅默认字符集、无符号',()=>{
    const passwords=generatePasswords(undefined);
    assert.equal(passwords.length,1);
    const password=passwords[0];
    assert.equal(password.length,16);
    assert.ok([...password].every(char=>DEFAULT_ALLOWED.includes(char)),password);
    assert.ok(/[a-z]/.test(password));
    assert.ok(/[A-Z]/.test(password));
    assert.ok(/[0-9]/.test(password));
    assert.ok(![...password].some(char=>SYMBOLS.includes(char)),password);
  });

  it('{} 与传入常量生成结果与默认一致',()=>{
    for(const options of [{},DEFAULT_PASSWORD_OPTIONS] as const){
      const passwords=generatePasswords(options);
      assert.equal(passwords.length,1);
      assert.equal(passwords[0].length,16);
      assert.ok([...passwords[0]].every(char=>DEFAULT_ALLOWED.includes(char)));
    }
  });

  it('默认不排除易混字符：字符池 62（含 0OoIl1），开启排除后为 56',()=>{
    assert.equal(passwordEntropy(undefined).poolSize,62);
    assert.equal(passwordEntropy({excludeAmbiguous:true}).poolSize,56);
  });

  it('默认不含符号：连续 10 条默认密码均无符号字符',()=>{
    const passwords=generatePasswords({count:10});
    assert.equal(passwords.length,10);
    for(const password of passwords){
      assert.equal(password.length,16);
      assert.ok(![...password].some(char=>SYMBOLS.includes(char)),password);
    }
  });

  it('默认常量不被调用改动',()=>{
    generatePasswords(undefined);
    passwordEntropy(undefined);
    generatePasswords({length:32,count:5});
    assert.deepEqual(DEFAULT_PASSWORD_OPTIONS,EXPECTED_DEFAULTS);
  });

  it('部分覆盖只改指定项：length 20 其余仍默认',()=>{
    const info=passwordEntropy({length:20});
    assert.equal(info.poolSize,62);
    assert.equal(info.length,20);
    assert.equal(info.count,1);
    assert.equal(info.enabledTypes,3);
    assert.equal(info.entropyBits,Math.round(Math.log2(62)*20*10)/10);
    const passwords=generatePasswords({length:20});
    assert.equal(passwords.length,1);
    assert.equal(passwords[0].length,20);
    assert.ok([...passwords[0]].every(char=>DEFAULT_ALLOWED.includes(char)));
  });

  it('部分覆盖只改指定项：count 3 其余仍默认',()=>{
    const passwords=generatePasswords({count:3});
    assert.equal(passwords.length,3);
    for(const password of passwords){
      assert.equal(password.length,16);
      assert.ok([...password].every(char=>DEFAULT_ALLOWED.includes(char)));
    }
    assert.equal(passwordEntropy({count:3}).count,3);
    assert.equal(passwordEntropy({count:3}).length,16);
  });

  it('符号开关开启时字符池变为 85，与默认 62 区分',()=>{
    assert.equal(passwordEntropy({symbols:true}).poolSize,85);
    assert.equal(passwordEntropy(undefined).poolSize,62);
  });

  it('transform 入口无参走默认：1 行 16 位无符号',async()=>{
    const output=await transformDeveloperInput('password','');
    assert.equal(output.split('\n').length,1);
    assert.equal(output.length,16);
    assert.ok([...output].every(char=>DEFAULT_ALLOWED.includes(char)),output);
  });

  it('默认强度为“强”，非“很强”：熵值 95.3 在 80–120 区间',()=>{
    const info=passwordEntropy(undefined);
    assert.equal(info.strength,'强');
    assert.ok(info.entropyBits>=80&&info.entropyBits<120);
  });
});
