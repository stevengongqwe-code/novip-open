import {useEffect, useMemo, useState} from 'react';
import {ToolPage, useJob, saveLocal} from './common';
import {
  PPT_EXTRACT_FILTER_DEFAULTS,
  PPT_EXTRACT_LIMITS,
  buildExtractedImageName,
  buildExtractedImagesZip,
  createSampleCoursewarePptx,
  filterExtractedImages,
  inspectPptImages,
  type ExtractedPptMedia,
  type PptExtractFilterOptions,
  type PptExtractInspectResult,
} from './ppt-extract-core';
import './ppt-extract.css';

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function PptExtract() {
  const job = useJob();
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileKey, setFileKey] = useState(0);
  const [inspected, setInspected] = useState<PptExtractInspectResult | null>(null);
  const [filters, setFilters] = useState<PptExtractFilterOptions>({...PPT_EXTRACT_FILTER_DEFAULTS});
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');

  const patchFilter = (next: Partial<PptExtractFilterOptions>) => {
    setNotice('');
    setFilters((cur) => ({...cur, ...next}));
  };

  const filteredItems = useMemo(
    () => (inspected ? filterExtractedImages(inspected.items, filters) : []),
    [inspected, filters],
  );

  // 为筛选出的前 48 张图片创建本地预览 URL，切换文件或卸载时及时释放内存。
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of filteredItems.slice(0, 48)) {
      try {
        const url = URL.createObjectURL(new Blob([item.bytes.slice().buffer], {type: item.mime}));
        map.set(item.id, url);
      } catch {
        /* 忽略测试桩环境异常 */
      }
    }
    return map;
  }, [filteredItems]);

  useEffect(() => {
    return () => {
      for (const url of previewUrls.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* Ignore */
        }
      }
    };
  }, [previewUrls]);

  const loadBytes = (bytes: Uint8Array, name: string) => {
    setNotice('');
    setBrokenThumbs({});
    void job.run(
      async (check) => {
        check();
        const res = inspectPptImages(bytes);
        check();
        return res;
      },
      (res) => {
        setFileName(name);
        setFileSize(bytes.length);
        setInspected(res);
        setFilters({...PPT_EXTRACT_FILTER_DEFAULTS});
        job.setStatus(`已解析「${name}」：共 ${res.slideCount} 页幻灯片、${res.supportedCount} 张可提取图片（含 ${res.duplicateCount} 张重复媒体）。`);
      },
    );
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file || job.busy) return;
    try {
      if (/\.ppt$/i.test(file.name)) {
        throw new Error(
          '你选的是旧版 .ppt 文件。解决办法：请先用电脑或手机 WPS 打开它，点击「另存为」选「.pptx 格式」，再上传就能提取图片啦！',
        );
      }
      if (file.size > PPT_EXTRACT_LIMITS.maxBytes) {
        throw new Error('这个 PPT 文件超过 40MB 上限啦。解决办法：可以先删掉几页或分成两份 .pptx 再上传。');
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      loadBytes(bytes, file.name);
    } catch (error) {
      job.setError(error instanceof Error ? error.message : '读取 PPTX 文件失败。');
    } finally {
      setFileKey((k) => k + 1);
    }
  };

  const handleLoadSample = () => {
    if (job.busy) return;
    const sampleBytes = createSampleCoursewarePptx();
    loadBytes(sampleBytes, '示例课程实验课件.pptx');
  };

  const resetAll = () => {
    job.reset();
    setFileName('');
    setFileSize(0);
    setInspected(null);
    setFilters({...PPT_EXTRACT_FILTER_DEFAULTS});
    setBrokenThumbs({});
    setNotice('');
    setFileKey((k) => k + 1);
  };

  const downloadSingle = (item: ExtractedPptMedia, index: number) => {
    const outName = buildExtractedImageName(item, index);
    saveLocal(new Blob([item.bytes.slice().buffer], {type: item.mime}), outName);
    setNotice(`已开始下载「${outName}」。`);
  };

  const downloadAllZip = () => {
    if (!filteredItems.length) return;
    try {
      const zipBytes = buildExtractedImagesZip(filteredItems, fileName || 'courseware.pptx');
      const stem = (fileName || 'courseware').replace(/\.pptx$/i, '');
      const zipName = `${stem}-提取图片共${filteredItems.length}张.zip`;
      saveLocal(new Blob([zipBytes.slice().buffer], {type: 'application/zip'}), zipName);
      setNotice(`已打包下载「${zipName}」（含 ${filteredItems.length} 张原图 + CSV 页码对照清单）。`);
    } catch (error) {
      job.setError(error instanceof Error ? error.message : '打包 ZIP 失败。');
    }
  };

  const slideOptions = useMemo(() => {
    if (!inspected) return [];
    const set = new Set<number>();
    for (const item of inspected.items) {
      if (!item.supported) continue;
      for (const s of item.slides) set.add(s);
    }
    return [...set].sort((a, b) => a - b);
  }, [inspected]);

  return (
    <ToolPage
      id="ppt-extract"
      title="PPT图片提取"
      description="从 .pptx 课件中一键无损提取内嵌高清原图（PNG / JPG / SVG / GIF / WebP），自动建立「图片 ↔ 幻灯片页码」对应关系，支持一键去重课件母版校徽/背景图、过滤小图标，并打包导出 ZIP + CSV 清单。100% 浏览器本地解包，不上传课件。"
      job={job}
    >
      <section className="study-card">
        <h2>1 选择 PPTX 课件</h2>
        <input
          key={fileKey}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          aria-label="选择要提取图片的 PPTX 文件"
          disabled={job.busy}
          onChange={(e) => void handleFileChange(e.target.files?.[0])}
        />
        <div className="study-actions">
          <button type="button" className="study-btn alt" disabled={job.busy} onClick={handleLoadSample}>
            载入示例课件 PPTX（一键体验）
          </button>
          {inspected && (
            <button type="button" className="study-btn alt" disabled={job.busy} onClick={resetAll}>
              重置 / 换一个文件
            </button>
          )}
        </div>
        <p className="study-note">
          支持标准 `.pptx` 文件（≤ 40MB）。直接从压缩包底层提取未经二次重压缩的原始媒体字节，比在 PPT 里右键「另存为图片」更清晰且更快。
        </p>

        {inspected && (
          <div className="ppt-ex-summary" role="region" aria-label="课件媒体统计">
            <div className="ppt-ex-stat">
              <span>当前文件</span>
              <strong title={fileName}>{formatBytes(fileSize)}</strong>
            </div>
            <div className="ppt-ex-stat">
              <span>幻灯片总页数</span>
              <strong>{inspected.slideCount} 页</strong>
            </div>
            <div className="ppt-ex-stat">
              <span>可提取图片总数</span>
              <strong>{inspected.supportedCount} 张</strong>
            </div>
            <div className="ppt-ex-stat">
              <span>去重后唯一原图</span>
              <strong>{inspected.uniqueSupportedCount} 张</strong>
            </div>
          </div>
        )}
      </section>

      {inspected && (
        <section className="study-card">
          <h2>2 去重与筛选规则</h2>
          <label className="study-check">
            <input
              type="checkbox"
              checked={filters.deduplicate}
              onChange={(e) => patchFilter({deduplicate: e.target.checked})}
            />
            <span>
              自动跳过完全重复的图片（已识别 <strong>{inspected.duplicateCount}</strong> 张重复校徽/母版背景，页码会自动合并到首张原图）
            </span>
          </label>

          <div className="study-fields" style={{marginTop: 12}}>
            <label>
              只看第几页 PPT 的图片（默认看全部）
              <select
                aria-label="按幻灯片页码筛选"
                value={String(filters.slideFilter)}
                onChange={(e) =>
                  patchFilter({slideFilter: e.target.value === 'all' ? 'all' : Number(e.target.value)})
                }
              >
                <option value="all">全部幻灯片（共 {inspected.slideCount} 页）</option>
                {slideOptions.map((s) => (
                  <option key={s} value={s}>
                    仅看第 {s} 页幻灯片引用的图片
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details className="novip-advanced-details">
            <summary>⚙️ 高级设置：按像素或文件大小过滤小装饰图（新手不用改）</summary>
            <div className="novip-advanced-body study-fields">
              <label>
                过滤小图标（最小短边像素 px，0 = 不过滤）
                <input
                  type="number"
                  aria-label="最小短边像素"
                  min={0}
                  max={2000}
                  step={10}
                  value={filters.minEdgePx}
                  onChange={(e) => patchFilter({minEdgePx: Math.max(0, Number(e.target.value) || 0)})}
                />
              </label>

              <label>
                过滤极小碎图（最小文件体积 KB，0 = 不过滤）
                <input
                  type="number"
                  aria-label="最小文件体积KB"
                  min={0}
                  max={5000}
                  step={1}
                  value={Math.round(filters.minBytes / 1024)}
                  onChange={(e) => patchFilter({minBytes: Math.max(0, (Number(e.target.value) || 0) * 1024)})}
                />
              </label>
            </div>
          </details>
        </section>
      )}

      {inspected && (
        <section className="study-card">
          <h2>
            3 挑选并保存图片（已找到 <strong>{filteredItems.length}</strong> 张图片）
          </h2>
          <p className="study-note" style={{marginTop: 0}}>
            💡 <strong>新手最简存图法：</strong>在手机上<strong>直接用手指长按下方任意图片</strong>，点「保存到手机 / 存储图像」就能存进相册！如果想把全部图片一次性存到电脑，再点下方打包下载按钮。
          </p>

          <div className="study-actions">
            <button
              type="button"
              className="study-btn"
              disabled={!filteredItems.length}
              onClick={downloadAllZip}
            >
              一键打包下载全部（{filteredItems.length} 张原图 + CSV 页码清单 .zip）
            </button>
          </div>

          {notice && <p className="study-message" role="status">{notice}</p>}

          {filteredItems.length === 0 ? (
            <p className="study-warning" role="status">
              当前筛选条件下没有符合要求的图片，请调小最小像素/体积限制或切换幻灯片页码。
            </p>
          ) : (
            <div className="ppt-ex-grid" role="list" aria-label="提取出的图片列表">
              {filteredItems.map((item, idx) => {
                const outName = buildExtractedImageName(item, idx);
                const thumbUrl = previewUrls.get(item.id);
                const showImg = Boolean(thumbUrl && !brokenThumbs[item.id]);
                return (
                  <div key={item.id} role="listitem" className="ppt-ex-card">
                    <div className="ppt-ex-thumb">
                      {showImg ? (
                        <img
                          src={thumbUrl}
                          alt={outName}
                          onError={() => setBrokenThumbs((prev) => ({...prev, [item.id]: true}))}
                        />
                      ) : (
                        <div className="ppt-ex-thumb-placeholder">
                          <span>{item.format.toUpperCase()} 原图</span>
                          <small>
                            {item.width > 0 ? `${item.width}×${item.height}px` : formatBytes(item.size)}
                          </small>
                        </div>
                      )}
                    </div>
                    <div className="ppt-ex-body">
                      <div className="ppt-ex-title">
                        <strong title={outName}>{outName}</strong>
                        <span className="ppt-ex-badge">{item.ext}</span>
                      </div>
                      <div className="ppt-ex-meta">
                        <span>{item.width > 0 ? `${item.width}×${item.height}px` : '矢量/未知尺寸'}</span>
                        <span>·</span>
                        <span>{formatBytes(item.size)}</span>
                      </div>
                      <div className="ppt-ex-slides">
                        {item.slides.length > 0 ? (
                          item.slides.map((s) => (
                            <span key={s} className="ppt-ex-slide-pill">
                              第 {s} 页
                            </span>
                          ))
                        ) : (
                          <span className="ppt-ex-dup-pill">母版/未直接引用</span>
                        )}
                        {item.isDuplicate && <span className="ppt-ex-dup-pill">重复项</span>}
                      </div>
                      <button
                        type="button"
                        className="study-btn alt"
                        style={{width: '100%', marginTop: 4}}
                        onClick={() => downloadSingle(item, idx)}
                      >
                        下载此图（{outName}）
                      </button>
                      <small style={{fontSize: 11, color: '#52525b', textAlign: 'center'}}>
                        📱 手机也可直接长按上方图片存相册
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {inspected.totalMediaCount > inspected.supportedCount && (
            <p className="study-note" style={{marginTop: 14}}>
              注：课件中另有 {inspected.totalMediaCount - inspected.supportedCount} 个非标准网页图片媒体（如 EMF/WMF 矢量图元或音视频），暂不在图片列表中导出。
            </p>
          )}
        </section>
      )}
    </ToolPage>
  );
}
