import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ABS_EPOCH_MS,
  MAX_ABS_SECONDS,
  TIME_ZONE_LABELS,
  convertTimestampValue,
  currentTimestamp,
  formatTimestamp,
  millisecondsToSeconds,
  parseDateTimeInput,
  parseTimestampInput,
  secondsToMilliseconds,
  timestampToDisplay,
} from '../src/tools/timestamp-core';

// 说明：核心函数只做 UTC 偏移运算，不依赖运行环境 TZ；因此这些断言在任何时区下都应通过。

describe('时间戳解析与单位识别',()=>{
  it('自动识别 10 位秒级与 13 位毫秒级',()=>{
    const seconds=parseTimestampInput('1700000000');
    assert.equal(seconds.unit,'s');
    assert.equal(seconds.digits,10);
    assert.equal(seconds.epochMs,1_700_000_000_000);
    assert.equal(seconds.seconds,1_700_000_000);
    assert.equal(seconds.milliseconds,1_700_000_000_000);
    const milliseconds=parseTimestampInput('1700000000000');
    assert.equal(milliseconds.unit,'ms');
    assert.equal(milliseconds.digits,13);
    assert.equal(milliseconds.epochMs,1_700_000_000_000);
    assert.equal(milliseconds.seconds,1_700_000_000);
  });
  it('0、少于 10 位、负值与前后空格都可识别',()=>{
    assert.equal(parseTimestampInput('0').epochMs,0);
    assert.equal(parseTimestampInput('0').unit,'s');
    assert.equal(parseTimestampInput('999').epochMs,999_000);
    assert.equal(parseTimestampInput('9999999999').epochMs,9_999_999_999_000);
    assert.equal(parseTimestampInput(' 1700000000 ').epochMs,1_700_000_000_000);
    assert.equal(parseTimestampInput('-1').epochMs,-1_000);
    assert.equal(parseTimestampInput('-1').seconds,-1);
    assert.equal(parseTimestampInput('-1700000000').epochMs,-1_700_000_000_000);
  });
  it('手动选择单位可覆盖自动识别',()=>{
    assert.equal(parseTimestampInput('17000000001','ms').epochMs,17_000_000_001);
    assert.equal(parseTimestampInput('0000000123','ms').epochMs,123);
    assert.equal(parseTimestampInput('0000000123','s').epochMs,123_000);
    assert.equal(parseTimestampInput('1700000000000','s').epochMs,1_700_000_000_000_000);
  });
  it('11/12 位无法自动识别时给出中文提示',()=>{
    assert.throws(()=>parseTimestampInput('17000000001'),/位数/);
    assert.throws(()=>parseTimestampInput('170000000012'),/位数/);
    assert.throws(()=>parseTimestampInput('12345678901234567'),/位数/);
  });
  it('非法格式给出中文错误',()=>{
    assert.throws(()=>parseTimestampInput(''),/请先输入/);
    assert.throws(()=>parseTimestampInput('abc'),/整数/);
    assert.throws(()=>parseTimestampInput('1.5'),/整数/);
    assert.throws(()=>parseTimestampInput('1e3'),/整数/);
    assert.throws(()=>parseTimestampInput('+1700000000'),/整数/);
  });
  it('超出可表示范围时中文报错',()=>{
    assert.throws(()=>parseTimestampInput(`${MAX_ABS_SECONDS+1}`,'s'),/范围/);
    assert.throws(()=>parseTimestampInput(`${MAX_ABS_EPOCH_MS+1}`,'ms'),/范围/);
    assert.equal(parseTimestampInput(`${MAX_ABS_EPOCH_MS}`,'ms').epochMs,MAX_ABS_EPOCH_MS);
  });
});

describe('时间戳 → 日期时间（上海 / UTC / ISO 8601）',()=>{
  it('时间戳 0 的上海时间、UTC 与 ISO 8601',()=>{
    const display=formatTimestamp(0,'Asia/Shanghai');
    assert.equal(display.dateTime,'1970-01-01 08:00:00');
    assert.equal(display.date,'1970-01-01');
    assert.equal(display.time,'08:00:00');
    assert.equal(display.weekday,'星期四');
    assert.equal(display.iso8601,'1970-01-01T08:00:00.000+08:00');
    assert.equal(display.utcDateTime,'1970-01-01 00:00:00');
    assert.equal(display.utcIso,'1970-01-01T00:00:00.000Z');
    assert.equal(display.offsetLabel,'UTC+08:00');
    assert.equal(display.seconds,0);
    assert.equal(display.milliseconds,0);
    const utc=formatTimestamp(0,'UTC');
    assert.equal(utc.dateTime,'1970-01-01 00:00:00');
    assert.equal(utc.iso8601,'1970-01-01T00:00:00.000Z');
    assert.equal(utc.offsetLabel,'UTC');
  });
  it('9999999999 秒边界换算正确',()=>{
    const display=timestampToDisplay('9999999999','auto','Asia/Shanghai').display;
    assert.equal(display.seconds,9_999_999_999);
    assert.equal(display.milliseconds,9_999_999_999_000);
    assert.equal(display.dateTime,'2286-11-21 01:46:39');
    assert.equal(display.weekday,'星期日');
    assert.equal(display.utcDateTime,'2286-11-20 17:46:39');
    assert.equal(display.iso8601,'2286-11-21T01:46:39.000+08:00');
  });
  it('毫秒时间戳保留毫秒并自动换算秒',()=>{
    const result=timestampToDisplay('1700000000123','auto','Asia/Shanghai');
    assert.equal(result.parsed.unit,'ms');
    assert.equal(result.parsed.seconds,1_700_000_000);
    assert.equal(result.display.dateTime,'2023-11-15 06:13:20');
    assert.equal(result.display.milliseconds,1_700_000_000_123);
    assert.equal(result.display.seconds,1_700_000_000);
  });
  it('负时间戳显示为 1970 年之前',()=>{
    const utc=timestampToDisplay('-1','auto','UTC').display;
    assert.equal(utc.dateTime,'1969-12-31 23:59:59');
    assert.equal(utc.milliseconds,-1_000);
    assert.equal(utc.seconds,-1);
    assert.equal(timestampToDisplay('-1','auto','Asia/Shanghai').display.dateTime,'1970-01-01 07:59:59');
  });
  it('超出范围或数值无效时中文报错',()=>{
    assert.throws(()=>formatTimestamp(Number.NaN),/无效/);
    assert.throws(()=>formatTimestamp(MAX_ABS_EPOCH_MS+1),/范围/);
    assert.throws(()=>formatTimestamp(MAX_ABS_EPOCH_MS,'Asia/Shanghai'),/范围/);
    assert.equal(formatTimestamp(MAX_ABS_EPOCH_MS,'UTC').utcDateTime,'275760-09-13 00:00:00');
  });
});

describe('日期时间 → 时间戳',()=>{
  it('上海时区日期时间转换',()=>{
    const result=parseDateTimeInput('2026-10-24 21:47:44','Asia/Shanghai');
    const expected=Date.UTC(2026,9,24,13,47,44);
    assert.equal(result.epochMs,expected);
    assert.equal(result.seconds,expected/1000);
    assert.equal(result.milliseconds,expected);
    assert.equal(result.normalized,'2026-10-24 21:47:44');
    assert.equal(result.display.dateTime,'2026-10-24 21:47:44');
    assert.equal(result.display.weekday,'星期六');
  });
  it('UTC 时区与 Unix 纪元边界',()=>{
    assert.equal(parseDateTimeInput('1970-01-01 00:00:00','UTC').epochMs,0);
    assert.equal(parseDateTimeInput('1970-01-01 08:00:00','Asia/Shanghai').epochMs,0);
    assert.equal(parseDateTimeInput('2026-10-24 21:47:44','UTC').epochMs,Date.UTC(2026,9,24,21,47,44));
    assert.equal(parseDateTimeInput('1969-12-31 23:59:59','UTC').epochMs,-1_000);
    assert.equal(parseDateTimeInput('1970-01-01 07:59:59','Asia/Shanghai').epochMs,-1_000);
  });
  it('闰日与闰年规则',()=>{
    const leap=parseDateTimeInput('2024-02-29 12:00:00','Asia/Shanghai');
    assert.equal(leap.epochMs,Date.UTC(2024,1,29,4));
    assert.equal(leap.display.dateTime,'2024-02-29 12:00:00');
    assert.equal(parseDateTimeInput('2000-02-29 00:00:00','UTC').epochMs,Date.UTC(2000,1,29));
    assert.throws(()=>parseDateTimeInput('2023-02-29 00:00:00'),/没有/);
    assert.throws(()=>parseDateTimeInput('1900-02-29 00:00:00'),/没有/);
    assert.throws(()=>parseDateTimeInput('2026-04-31 00:00:00'),/没有/);
    assert.throws(()=>parseDateTimeInput('2026-02-30 00:00:00'),/没有/);
  });
  it('接受 T 分隔、省略秒与毫秒',()=>{
    assert.equal(parseDateTimeInput('2026-10-24T21:47:44','Asia/Shanghai').epochMs,Date.UTC(2026,9,24,13,47,44));
    assert.equal(parseDateTimeInput('2026-10-24 21:47','Asia/Shanghai').epochMs,Date.UTC(2026,9,24,13,47,0));
    assert.equal(parseDateTimeInput('2026-10-24 21:47:44.500','UTC').epochMs,Date.UTC(2026,9,24,21,47,44,500));
  });
  it('非法日期时间给出中文错误',()=>{
    const cases:[string,RegExp][]=[
      ['',/日期时间/],
      ['2026/10/24 00:00:00',/格式/],
      ['2026-10-24',/格式/],
      ['2026-13-01 00:00:00',/月份/],
      ['2026-00-01 00:00:00',/月份/],
      ['2026-10-24 24:00:00',/小时/],
      ['2026-10-24 23:60:00',/分钟/],
      ['2026-10-24 23:59:60',/秒/],
      ['0000-01-01 00:00:00',/年份/],
    ];
    for(const [value,pattern] of cases)assert.throws(()=>parseDateTimeInput(value),pattern,value);
  });
  it('上海与 UTC 之间相差固定 8 小时',()=>{
    const shanghai=parseDateTimeInput('2026-01-01 08:00:00','Asia/Shanghai').epochMs;
    const utc=parseDateTimeInput('2026-01-01 00:00:00','UTC').epochMs;
    assert.equal(shanghai,utc);
  });
});

describe('秒 / 毫秒互转与当前时间',()=>{
  it('毫秒转秒向零截断，秒转毫秒无精度损失',()=>{
    assert.equal(millisecondsToSeconds(1_700_000_000_123),1_700_000_000);
    assert.equal(millisecondsToSeconds(1_999),1);
    assert.equal(millisecondsToSeconds(-1_500),-1);
    assert.equal(secondsToMilliseconds(1_700_000_000),1_700_000_000_000);
    assert.equal(secondsToMilliseconds(-1),-1_000);
    assert.throws(()=>millisecondsToSeconds(Number.NaN),/无效/);
    assert.throws(()=>secondsToMilliseconds(Number.POSITIVE_INFINITY),/无效/);
    assert.throws(()=>secondsToMilliseconds(MAX_ABS_SECONDS+1),/范围/);
  });
  it('convertTimestampValue 同时给出秒与毫秒',()=>{
    const conversion=convertTimestampValue('1700000000123','auto');
    assert.equal(conversion.parsed.unit,'ms');
    assert.equal(conversion.parsed.seconds,1_700_000_000);
    assert.equal(conversion.display.milliseconds,1_700_000_000_123);
    assert.equal(conversion.display.timeZone,'Asia/Shanghai');
  });
  it('当前时间戳按传入时钟计算（秒/毫秒/上海与 UTC）',()=>{
    const now=Date.UTC(2026,9,24,13,47,44,123);
    const current=currentTimestamp(now);
    assert.equal(current.epochMs,now);
    assert.equal(current.seconds,1_792_849_664);
    assert.equal(current.milliseconds,now);
    assert.equal(current.dateTime,'2026-10-24 21:47:44');
    assert.equal(current.weekday,'星期六');
    assert.equal(current.shanghaiDateTime,'2026-10-24 21:47:44');
    assert.equal(current.utcDateTime,'2026-10-24 13:47:44');
  });
  it('时区标签与偏移固定为 UTC+8，不受夏令时影响',()=>{
    assert.match(TIME_ZONE_LABELS['Asia/Shanghai'],/UTC\+8/);
    assert.match(TIME_ZONE_LABELS.UTC,/UTC/);
    assert.equal(formatTimestamp(Date.UTC(2026,0,1),'Asia/Shanghai').dateTime,'2026-01-01 08:00:00');
    assert.equal(formatTimestamp(Date.UTC(2026,6,1),'Asia/Shanghai').dateTime,'2026-07-01 08:00:00');
  });
});
