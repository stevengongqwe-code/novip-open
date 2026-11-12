#!/usr/bin/env node
/**
 * Batch1 浏览器验收测试数据生成器（无第三方二进制依赖；PDF 使用仓库已有 pdf-lib）。
 * 用法：node docs/qa-logs/batch1/make-fixtures.mjs
 * 输出：docs/qa-logs/batch1/fixtures/{color-sample.png,stitch-a.png,stitch-b.png,sample-3p.pdf}
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUT = new URL('./fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('color-sample.png', OUT), png(40, 20, (x) => (x < 20 ? [225, 29, 72] : [37, 99, 235])));
writeFileSync(new URL('stitch-a.png', OUT), png(400, 300, () => [34, 197, 94]));
writeFileSync(new URL('stitch-b.png', OUT), png(300, 500, () => [249, 115, 22]));

const doc = await PDFDocument.create();
doc.setCreationDate(new Date(0));
doc.setModificationDate(new Date(0));
doc.setProducer('NOVIP QA fixture');
doc.setCreator('NOVIP QA fixture');
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const [w, h] of [[595, 842], [612, 792], [420, 595]]) {
  const page = doc.addPage([w, h]);
  page.drawText(`Page ${doc.getPageCount()} content`, { x: 60, y: 700, size: 18, font, color: rgb(0, 0, 0) });
}
writeFileSync(new URL('sample-3p.pdf', OUT), Buffer.from(await doc.save()));
console.log('fixtures 已生成：color-sample.png / stitch-a.png / stitch-b.png / sample-3p.pdf');
