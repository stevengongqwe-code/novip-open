import { useEffect, useRef, useState } from 'react';
import { ToolPage, useJob, saveLocal } from './common';
import { inspectPhoto } from '../features/id-photo/core';
import { decodeImage, createCanvas } from '../conversion/canvas';
import { editMask, backgroundPreview } from './background-core';
import { consumePhotoTransfer } from '../features/id-photo/photo-check-core';

export default function Background() {
  const job = useJob();
  const preview = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLCanvasElement | undefined>(undefined);
  const mask = useRef<HTMLCanvasElement | undefined>(undefined);
  const undo = useRef<ImageData[]>([]);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [radius, setRadius] = useState(24);
  const [restore, setRestore] = useState(false);
  const [revision, setRevision] = useState(0);

  const release = () => {
    for (const c of [original.current, mask.current]) {
      if (c) c.width = c.height = 1;
    }
    original.current = mask.current = undefined;
    undo.current = [];
    drag.current = null;
  };

  useEffect(() => release, []);

  const loadFile = (f: File) => {
    void job.run(
      async (check) => {
        if (f.size > 20 * 1024 * 1024) throw new Error("最多20MB。");
        const b = new Uint8Array(await f.arrayBuffer());
        const info = inspectPhoto(b);
        if (info.width * info.height > 2_000_000)
          throw new Error("Beta手动编辑最多200万像素；请先自行调整图片尺寸，本工具不擅自降像素。");
        const im = await decodeImage(b, info.mime);
        try {
          check();
          const o = createCanvas(im.width, im.height);
          const m = createCanvas(im.width, im.height);
          o.getContext("2d")!.drawImage(im, 0, 0);
          m.getContext("2d")!.drawImage(im, 0, 0);
          return { o, m };
        } finally {
          im.close();
        }
      },
      (r) => {
        release();
        original.current = r.o;
        mask.current = r.m;
        setReady(true);
        setRevision((x) => x + 1);
      }
    );
  };

  // 自动检测从报名照工具带过来的照片
  useEffect(() => {
    try {
      const pCheck = consumePhotoTransfer();
      if (pCheck?.file) {
        loadFile(pCheck.file);
        return;
      }
      const transferred = sessionStorage.getItem('novip:transfer_photo');
      if (transferred) {
        sessionStorage.removeItem('novip:transfer_photo');
        const img = new Image();
        img.onload = () => {
          release();
          const o = createCanvas(img.width, img.height);
          const m = createCanvas(img.width, img.height);
          o.getContext('2d')!.drawImage(img, 0, 0);
          m.getContext('2d')!.drawImage(img, 0, 0);
          original.current = o;
          mask.current = m;
          setReady(true);
          setRevision((x) => x + 1);
        };
        img.src = transferred;
      }
    } catch {}
  }, []);

  useEffect(() => {
    const p = preview.current;
    const m = mask.current;
    if (p && m) {
      p.width = m.width;
      p.height = m.height;
      backgroundPreview(p, m, color);
    }
  }, [color, revision, ready]);

  const draw = (x: number, y: number) => {
    const m = mask.current;
    const o = original.current;
    if (m && o) editMask(m, o, x, y, radius, restore);
  };

  const loadSampleImage = () => {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 640;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // 渐变灰白色背景模拟生活照背景
    const grad = ctx.createLinearGradient(0, 0, 480, 640);
    grad.addColorStop(0, '#e2e8f0');
    grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 480, 640);
    // 人脸
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(240, 240, 95, 0, Math.PI * 2);
    ctx.fill();
    // 衣服
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(240, 560, 180, 180, 0, Math.PI, 0, false);
    ctx.fill();

    release();
    const o = createCanvas(480, 640);
    const m = createCanvas(480, 640);
    o.getContext('2d')!.drawImage(c, 0, 0);
    m.getContext('2d')!.drawImage(c, 0, 0);
    original.current = o;
    mask.current = m;
    setReady(true);
    setRevision((x) => x + 1);
  };

  const handoverToIdPhoto = () => {
    if (!preview.current) return;
    preview.current.toBlob((b) => {
      if (b?.size) {
        const reader = new FileReader();
        reader.onload = () => {
          sessionStorage.setItem('novip:transfer_photo', reader.result as string);
          history.pushState(null, '', '/tools/id-photo');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.scrollTo({ top: 0 });
        };
        reader.readAsDataURL(b);
      }
    }, 'image/png');
  };

  return (
    <ToolPage
      id="background"
      title="手动换底色与涂抹修边"
      description="手指滑动涂掉杂乱背景，轻松更换天蓝、纯白或大红底色；修好后一键直达报名照助手完成裁切与 100KB 锁定。"
      job={job}
    >
      <section className="study-card">
        {/* 新手 3 步导航引导 */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, color: '#1c1c1e', fontSize: 13 }}>
            <span>💡 新手 3 步指南：</span>
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, display: 'grid', gap: 4 }}>
            <div><strong>1. 选择照片：</strong>支持手机相册照片，或者点右侧「试用示例照片」快速体验。</div>
            <div><strong>2. 涂抹去背景：</strong>手指在画面杂乱背景上滑动涂抹；若误抹了头发，把模式换成「恢复原图区域」涂回。</div>
            <div><strong>3. 换底色与直达：</strong>选蓝底/白底/红底，点击「一键去【做一寸/二寸报名照并锁100KB】」直接完成。</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={job.busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="study-btn alt"
            onClick={loadSampleImage}
            style={{ fontSize: 12 }}
          >
            试用示例人像（直接体验涂抹）
          </button>
        </div>

        <div className="study-fields">
          <label>
            底色
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label>
            画笔大小 (px)
            <input type="range" min="2" max="100" value={radius} onChange={(e) => setRadius(+e.target.value)} />
            {radius}
          </label>
          <label>
            操作模式
            <select value={restore ? 'restore' : 'erase'} onChange={(e) => setRestore(e.target.value === 'restore')}>
              <option value="erase">手指涂抹：擦除多余背景</option>
              <option value="restore">手指涂抹：恢复误擦原图区域</option>
            </select>
          </label>
        </div>

        <div className="study-actions">
          {[
            ['纯白', '#ffffff'],
            ['天蓝', '#3b82f6'],
            ['正红', '#ef4444'],
          ].map(([n, c]) => (
            <button className="study-btn alt" key={n} onClick={() => setColor(c)}>
              {n}底
            </button>
          ))}
          <button
            className="study-btn alt"
            disabled={!ready || !undo.current.length}
            onClick={() => {
              const data = undo.current.pop();
              if (data) {
                mask.current!.getContext('2d')!.putImageData(data, 0, 0);
                setRevision((x) => x + 1);
              }
            }}
          >
            撤销一笔
          </button>
          <button
            className="study-btn alt"
            disabled={!ready}
            onClick={() => {
              mask.current!.getContext('2d')!.clearRect(0, 0, mask.current!.width, mask.current!.height);
              mask.current!.getContext('2d')!.drawImage(original.current!, 0, 0);
              undo.current = [];
              setRevision((x) => x + 1);
            }}
          >
            恢复原图
          </button>
          <button
            className="study-btn alt"
            onClick={() => {
              job.reset();
              release();
              setReady(false);
            }}
          >
            清空
          </button>
        </div>

        {ready ? (
          <>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
              手指或鼠标滑动擦除多余背景；修好后可直接点击蓝色的「一键去【做一寸/二寸报名照并锁100KB】」进行最终裁切。
            </p>
            <canvas
              ref={preview}
              aria-label="手动背景修边画布"
              style={{ touchAction: 'none', border: '1px solid #b8cdbd', maxWidth: '100%', borderRadius: 8 }}
              onPointerDown={(e) => {
                if (!e.isPrimary || !mask.current) return;
                const m = mask.current;
                undo.current.push(m.getContext('2d')!.getImageData(0, 0, m.width, m.height));
                if (undo.current.length > 5) undo.current.shift();
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * m.width;
                const y = ((e.clientY - r.top) / r.height) * m.height;
                drag.current = { id: e.pointerId, x, y };
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {}
                draw(x, y);
                setRevision((v) => v + 1);
              }}
              onPointerMove={(e) => {
                const last = drag.current;
                const m = mask.current;
                if (!last || last.id !== e.pointerId || !m) return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * m.width;
                const y = ((e.clientY - r.top) / r.height) * m.height;
                const steps = Math.ceil(Math.hypot(x - last.x, y - last.y) / Math.max(1, radius / 2));
                for (let i = 1; i <= steps; i++) {
                  draw(last.x + ((x - last.x) * i) / steps, last.y + ((y - last.y) * i) / steps);
                }
                drag.current = { id: last.id, x, y };
                setRevision((v) => v + 1);
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <button
                className="study-btn"
                onClick={() => {
                  preview.current?.toBlob((b) => {
                    if (b?.size) saveLocal(b, '手动换底副本.png');
                    else job.setError('PNG编码失败。');
                  }, 'image/png');
                }}
              >
                下载当前修图副本 (PNG)
              </button>
              <button
                type="button"
                className="study-btn"
                style={{ background: '#0071e3', borderColor: '#0071e3', color: '#fff' }}
                onClick={handoverToIdPhoto}
              >
                👉 完成修图，一键去【做一寸/二寸报名照并锁100KB】
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 16, padding: '16px', border: '1px dashed #cbd5e1', borderRadius: 10, textAlign: 'center', background: '#fafafa' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>
              还没选择照片？点上方按钮上传生活照，或点「试用示例人像」立即体验换底色与涂抹修边。
            </p>
            <a
              href="/tools/id-photo"
              className="study-btn alt"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontSize: 12 }}
            >
              👉 如果背景已经很干净，可直接去【一寸/二寸报名照制作】
            </a>
          </div>
        )}
      </section>
    </ToolPage>
  );
}
