/**
 * 二维码生成与解析（Factory Day 4，2026-10-30）：纯函数 + 编解码往返测试。
 * 往返测试用 qrcode.create 生成模块矩阵 → 合成像素 → jsQR 解码，
 * 证明编解码链真实可用，而非静态假页面。
 * 运行：npm test（node --import tsx --test tests/*.test.ts）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  buildQrPayload,
  buildWifiPayload,
  buildEmailPayload,
  buildPhonePayload,
  escapeWifiField,
  classifyContent,
  isSafeHttpUrl,
  validateQrPayload,
  byteLength,
  qrDownloadName,
  modulesToImageData,
} from '../src/tools/qr-core';
import { tools, currentPage } from '../src/tools/registry';
import { pathTools, pageSeo, toolNotes } from '../src/seo';

describe('二维码 payload 构造', () => {
  it('WiFi payload 与特殊字符转义', () => {
    assert.equal(
      buildWifiPayload({ ssid: 'GSAU-202', password: 'p;ss:word', encryption: 'WPA' }),
      'WIFI:T:WPA;S:GSAU-202;P:p\\;ss\\:word;',
    );
    assert.equal(escapeWifiField('a;b,c:d"e\\f'), 'a\\;b\\,c\\:d\\"e\\\\f');
    assert.equal(buildWifiPayload({ ssid: 'Library', password: '', encryption: 'nopass' }), 'WIFI:T:nopass;S:Library;');
    assert.throws(() => buildWifiPayload({ ssid: '  ', password: '', encryption: 'WPA' }), /WiFi 名称不能为空/);
  });

  it('邮件与电话 payload', () => {
    assert.equal(buildEmailPayload('a@b.edu.cn', '请假', '老师好'), 'mailto:a@b.edu.cn?subject=%E8%AF%B7%E5%81%87&body=%E8%80%81%E5%B8%88%E5%A5%BD');
    assert.equal(buildEmailPayload('a@b.edu.cn'), 'mailto:a@b.edu.cn');
    assert.throws(() => buildEmailPayload('not-an-email'), /邮箱地址格式不正确/);
    assert.equal(buildPhonePayload('+86 138 0000 0000'), 'tel:+8613800000000');
    assert.throws(() => buildPhonePayload('abc'), /电话号码只能含/);
  });

  it('buildQrPayload 空内容拒绝', () => {
    assert.throws(() => buildQrPayload({ kind: 'text', text: '   ' }), /内容不能为空/);
    assert.equal(buildQrPayload({ kind: 'text', text: '  hello  ' }), 'hello');
  });

  it('字节长度与纠错级别上限', () => {
    assert.equal(byteLength('中文'), 6);
    assert.throws(() => validateQrPayload('x'.repeat(1274), 'H'), /内容过长/);
    validateQrPayload('x'.repeat(1273), 'H');
    validateQrPayload('x'.repeat(2331), 'M');
  });

  it('内容分类与安全 URL 判定（防钓鱼：非 http(s) 不给打开按钮）', () => {
    assert.equal(classifyContent('https://novip.site/tools/qr'), 'url');
    assert.equal(classifyContent('WIFI:T:WPA;S:x;P:y;;'), 'wifi');
    assert.equal(classifyContent('mailto:a@b.edu.cn'), 'email');
    assert.equal(classifyContent('tel:+861380000000'), 'phone');
    assert.equal(classifyContent('只是文字'), 'text');
    assert.equal(isSafeHttpUrl('https://example.com/path?q=1'), true);
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
    assert.equal(isSafeHttpUrl('不是链接'), false);
  });

  it('下载文件名', () => {
    assert.equal(qrDownloadName('wifi', 'png'), 'novip-qr-wifi.png');
    assert.equal(qrDownloadName('url', 'svg'), 'novip-qr-url.svg');
  });
});

describe('二维码编解码往返（qrcode → 像素 → jsQR）', () => {
  for (const [label, text] of [
    ['链接', 'https://novip.site/tools/qr'],
    ['中文文本', '大学生，别花冤枉钱。'],
    ['WiFi', 'WIFI:T:WPA;S:GSAU-202;P:hello123;;'],
  ] as const) {
    it(`${label}：编码后可被 jsQR 解回原文`, () => {
      const created = QRCode.create(text, { errorCorrectionLevel: 'M' });
      const { size, data } = created.modules;
      const image = modulesToImageData(
        { size, get: (row, col) => data[row * size + col] === 1 },
        8,
      );
      const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      assert.ok(decoded, `${label} 应能解码`);
      assert.equal(decoded!.data, text);
    });
  }
});

describe('二维码独立页接线（/tools/qr）', () => {
  it('registry 与路由解析', () => {
    const qr = tools.find((t) => t.id === 'qr');
    assert.ok(qr, 'qr 工具应存在');
    assert.equal(qr.path, '/tools/qr');
    assert.equal(currentPage('/tools/qr', ''), 'qr');
    assert.equal(currentPage('/tools/qr/', ''), 'qr');
    assert.ok(pathTools.some((t) => t.id === 'qr'), 'qr 应进入 pathTools，否则不生成独立页与 sitemap');
    const paths = pathTools.map((t) => t.path);
    assert.equal(new Set(paths).size, paths.length, 'pathTools 路径不得重复');
  });

  it('SEO canonical 与专属说明', () => {
    const seo = pageSeo('qr');
    assert.equal(seo.canonical, 'https://novip.site/tools/qr');
    assert.match(seo.title, /二维码/);
    assert.ok(toolNotes.qr, 'qr 应有 toolNotes 说明');
    assert.match(toolNotes.qr!, /本地/);
  });
});
