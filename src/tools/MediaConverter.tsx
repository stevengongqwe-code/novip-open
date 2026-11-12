import React, { useState, useRef, useEffect } from 'react';
import { ToolPage, saveLocal, useJob } from './common';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import {
  encodeWav,
  encodeMp3,
  sliceAudioSamples,
  formatMediaDuration,
  type AudioTargetFormat,
  type Mp3Bitrate,
} from './media-converter-core';
import {
  Film,
  Music,
  Scissors,
  Sparkles,
  Download,
  Play,
  Pause,
  Upload,
  RefreshCw,
} from 'lucide-react';

export default function MediaConverter() {
  const job = useJob();
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'video' | 'audio'>('video');
  const [mode, setMode] = useState<'extract-audio' | 'trim-audio' | 'video-to-gif'>('extract-audio');

  // 音频参数
  const [audioFormat, setAudioFormat] = useState<AudioTargetFormat>('mp3');
  const [bitrate, setBitrate] = useState<Mp3Bitrate>(128);
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);

  // GIF 参数
  const [gifFps, setGifFps] = useState<number>(10);
  const [gifWidth, setGifWidth] = useState<number>(480);

  // 转换输出结果
  const [outputUrl, setOutputUrl] = useState<string>('');
  const [outputName, setOutputName] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // 载入示例测试视频
  const handleLoadSampleVideo = () => {
    // 动态生成一段 3 秒的 480x360 动画演示视频（Canvas 录制为 WebM）
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const sampleFile = new File([blob], 'college-lecture-sample.webm', { type: 'video/webm' });
      handleFileSelected(sampleFile);
    };

    recorder.start();

    // 绘制 90 帧动画 (3秒)
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      // 动态彩色背景
      const hue = (frame * 4) % 360;
      ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
      ctx.fillRect(0, 0, 480, 360);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NOVIP 网课音视频处理', 240, 160);

      ctx.font = '16px -apple-system, sans-serif';
      ctx.fillText(`正在演示第 ${frame}/90 帧 动态提取…`, 240, 210);

      if (frame >= 90) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 33);
  };

  const handleFileSelected = (f: File) => {
    setFile(f);
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setOutputUrl('');

    const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name);
    setMediaType(isVid ? 'video' : 'audio');
    if (!isVid && mode === 'video-to-gif') {
      setMode('extract-audio');
    }

    // 探测时长
    if (isVid) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        setDuration(vid.duration || 10);
        setTrimStart(0);
        setTrimEnd(Math.min(vid.duration || 10, 30));
      };
      vid.src = url;
    } else {
      const aud = document.createElement('audio');
      aud.preload = 'metadata';
      aud.onloadedmetadata = () => {
        setDuration(aud.duration || 10);
        setTrimStart(0);
        setTrimEnd(aud.duration || 10);
      };
      aud.src = url;
    }
  };

  // 提取或转换音频逻辑
  const handleConvertAudio = async () => {
    if (!file) return;
    job.run(
      async () => {
        setProgress(15);
        const arrayBuffer = await file.arrayBuffer();
        setProgress(35);

        // 使用浏览器 Web Audio 解码任何媒体音频流
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        setProgress(65);

        let channelData: Float32Array[] = [];
        for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
          channelData.push(decodedBuffer.getChannelData(i));
        }

        // 裁剪判断
        if (mode === 'trim-audio') {
          channelData = sliceAudioSamples(channelData, decodedBuffer.sampleRate, trimStart, trimEnd);
        }

        setProgress(80);
        let outputBlob: Blob;
        let outName = file.name.replace(/\.[^.]+$/, '');

        if (audioFormat === 'mp3') {
          const mp3Bytes = encodeMp3(channelData, decodedBuffer.sampleRate, bitrate);
          outputBlob = new Blob([mp3Bytes.buffer as ArrayBuffer], { type: 'audio/mp3' });
          outName += `_${bitrate}kbps.mp3`;
        } else {
          const wavBytes = encodeWav(channelData, decodedBuffer.sampleRate);
          outputBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' });
          outName += '.wav';
        }

        setProgress(100);
        const resUrl = URL.createObjectURL(outputBlob);
        setOutputUrl(resUrl);
        setOutputName(outName);
        saveLocal(outputBlob, outName);
        return true;
      },
      () => {
        showToast(`已成功导出音频「${outputName || 'audio'}」`);
      }
    );
  };

  // 视频截取转 GIF 逻辑
  const handleVideoToGif = async () => {
    if (!file || mediaType !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    job.run(
      async () => {
        setProgress(10);
        const gif = GIFEncoder();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法初始化画板');

        const aspect = (video.videoHeight || 360) / (video.videoWidth || 480);
        const w = gifWidth;
        const h = Math.round(w * aspect);
        canvas.width = w;
        canvas.height = h;

        const start = trimStart;
        const end = Math.min(trimEnd, start + 12); // 最长截取 12 秒
        const totalDuration = end - start;
        const frameInterval = 1 / gifFps;
        const totalFrames = Math.max(1, Math.floor(totalDuration * gifFps));

        for (let i = 0; i < totalFrames; i++) {
          const currentTime = start + i * frameInterval;
          video.currentTime = currentTime;
          await new Promise(r => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              r(true);
            };
            video.addEventListener('seeked', onSeeked);
          });

          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const { data } = imageData;

          // 使用 gifenc 量化调色板与写入帧
          const palette = quantize(data, 256);
          const index = applyPalette(data, palette);
          gif.writeFrame(index, w, h, {
            palette,
            delay: Math.round(1000 / gifFps),
          });

          setProgress(Math.round(15 + (i / totalFrames) * 80));
        }

        gif.finish();
        const gifBytes = gif.bytes();
        const gifBlob = new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' });
        const outName = `${file.name.replace(/\.[^.]+$/, '')}_${w}p.gif`;

        setProgress(100);
        const resUrl = URL.createObjectURL(gifBlob);
        setOutputUrl(resUrl);
        setOutputName(outName);
        saveLocal(gifBlob, outName);
        return true;
      },
      () => {
        showToast('已成功生成动图 GIF 并开始下载');
      }
    );
  };

  const showToast = (message: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novip:toast', { detail: { message } }));
    }
  };

  return (
    <ToolPage
      id="media-converter"
      title="音视频格式转换与音频提取"
      description="网课视频提取纯音频复习、录音格式转 MP3/WAV，或视频截取制作动态 GIF。全浏览器本地离线极速处理，保护个人隐私，零流量消耗。"
      job={job}
    >
      {/* 模式选择 Tab */}
      <section className="novip-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Film size={18} color="#0071e3" />
          <span>选择音视频处理任务</span>
        </h3>
        <div className="media-mode-grid">
          {[
            {
              id: 'extract-audio',
              name: '提取纯音频 / 格式转 MP3',
              desc: '从网课或视频中无损提取音频，支持 MP4/WebM/MOV/M4A -> MP3/WAV',
              icon: Music,
            },
            {
              id: 'trim-audio',
              name: '音频片段裁剪与截取',
              desc: '设定起止时间精确截取重点语音或精彩铃声片段',
              icon: Scissors,
            },
            {
              id: 'video-to-gif',
              name: '视频截取转动图 GIF',
              desc: '将实验演示或重点动作视频转为免播放器的轻量 GIF 插入报告',
              icon: Film,
            },
          ].map(item => {
            const isSelected = mode === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id as any)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isSelected ? '2px solid #0071e3' : '1px solid #e2e8f0',
                  background: isSelected ? 'rgba(0, 113, 227, 0.05)' : '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14, color: isSelected ? '#0071e3' : '#1d1d1f' }}>
                  <Icon size={16} color={isSelected ? '#0071e3' : '#6e6e73'} />
                  <span>{item.name}</span>
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 4, lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 主工作区 */}
      {fileUrl ? (
        <div className="media-layout-grid">
          {/* 媒体播放与起止时间调节区 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>
                当前文件：{file?.name} (时长：{formatMediaDuration(duration)})
              </span>
              <label
                style={{
                  fontSize: 12,
                  color: '#0071e3',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={12} />
                <span>更换文件</span>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0]);
                  }}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* 播放器容器 */}
            <div
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                background: '#000',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                maxHeight: 360,
              }}
            >
              {mediaType === 'video' ? (
                <video
                  ref={videoRef}
                  src={fileUrl}
                  controls
                  style={{ width: '100%', maxHeight: 360, display: 'block' }}
                />
              ) : (
                <audio
                  ref={audioRef}
                  src={fileUrl}
                  controls
                  style={{ width: '100%', margin: '40px 20px' }}
                />
              )}
            </div>

            {/* 起止时间滑块 (裁剪模式或 GIF 模式) */}
            {(mode === 'trim-audio' || mode === 'video-to-gif') && (
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 8 }}>
                  <span>起始：{formatMediaDuration(trimStart)}</span>
                  <span>结束：{formatMediaDuration(trimEnd)}</span>
                  <span>截取区间：{formatMediaDuration(Math.max(0, trimEnd - trimStart))}</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="range"
                    min="0"
                    max={duration || 60}
                    step="0.5"
                    value={trimStart}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setTrimStart(Math.min(v, trimEnd - 0.5));
                    }}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <input
                    type="range"
                    min="0"
                    max={duration || 60}
                    step="0.5"
                    value={trimEnd}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      setTrimEnd(Math.max(v, trimStart + 0.5));
                    }}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* 右侧参数与导出操作区 */}
          <section className="novip-card" style={{ padding: 18 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 15, color: '#1d1d1f' }}>转换参数设置</h4>

            {mode === 'video-to-gif' ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 6 }}>
                    动图帧率 (FPS)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[5, 10, 15].map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setGifFps(f)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 8,
                          border: gifFps === f ? '2px solid #0071e3' : '1px solid #e2e8f0',
                          background: gifFps === f ? '#0071e3' : '#fff',
                          color: gifFps === f ? '#fff' : '#1d1d1f',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 6 }}>
                    画面宽度
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[320, 480, 640].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setGifWidth(w)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 8,
                          border: gifWidth === w ? '2px solid #0071e3' : '1px solid #e2e8f0',
                          background: gifWidth === w ? '#0071e3' : '#fff',
                          color: gifWidth === w ? '#fff' : '#1d1d1f',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleVideoToGif}
                  disabled={job.busy}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    borderRadius: 14,
                    border: 0,
                    background: '#0071e3',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(0, 113, 227, 0.3)',
                  }}
                >
                  <Download size={16} />
                  <span>{job.busy ? `正在逐帧渲染 (${progress}%)…` : '开始转换并生成 GIF'}</span>
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 6 }}>
                    目标音频格式
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['mp3', 'wav'] as AudioTargetFormat[]).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setAudioFormat(fmt)}
                        style={{
                          flex: 1,
                          padding: '8px 0',
                          borderRadius: 8,
                          border: audioFormat === fmt ? '2px solid #0071e3' : '1px solid #e2e8f0',
                          background: audioFormat === fmt ? '#0071e3' : '#fff',
                          color: audioFormat === fmt ? '#fff' : '#1d1d1f',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {audioFormat === 'mp3' && (
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, color: '#6e6e73', display: 'block', marginBottom: 6 }}>
                      MP3 码率与音质
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { b: 64, label: '64 kbps (网课省流)' },
                        { b: 128, label: '128 kbps (标准)' },
                        { b: 192, label: '192 kbps (高品质)' },
                        { b: 320, label: '320 kbps (极致)' },
                      ].map(item => (
                        <button
                          key={item.b}
                          type="button"
                          onClick={() => setBitrate(item.b as any)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: 8,
                            border: bitrate === item.b ? '2px solid #0071e3' : '1px solid #e2e8f0',
                            background: bitrate === item.b ? 'rgba(0, 113, 227, 0.08)' : '#fff',
                            color: bitrate === item.b ? '#0071e3' : '#1d1d1f',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConvertAudio}
                  disabled={job.busy}
                  style={{
                    width: '100%',
                    padding: '12px 18px',
                    borderRadius: 14,
                    border: 0,
                    background: '#0071e3',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(0, 113, 227, 0.3)',
                  }}
                >
                  <Download size={16} />
                  <span>{job.busy ? `正在转码音频 (${progress}%)…` : '开始提取并下载音频'}</span>
                </button>
              </>
            )}

            {/* 输出预览与下载卡片 */}
            {outputUrl && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 4 }}>
                  ✓ 转换完成并已自动触发下载
                </div>
                <div style={{ fontSize: 11, color: '#15803d', wordBreak: 'break-all' }}>
                  {outputName}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* 空状态拖拽选择区 */
        <section
          className="novip-card"
          style={{
            padding: 48,
            textAlign: 'center',
            border: '2px dashed #0071e3',
            borderRadius: 20,
            background: 'rgba(0, 113, 227, 0.02)',
            marginBottom: 20,
          }}
        >
          <Film size={48} color="#0071e3" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: 18, color: '#1d1d1f', margin: '0 0 8px' }}>
            选择或拖入需要处理的音视频文件
          </h3>
          <p style={{ fontSize: 13, color: '#6e6e73', margin: '0 0 20px' }}>
            支持 MP4、WebM、MOV、MKV、M4A、WAV、MP3 等。浏览器端多线程处理，无需上传云端。
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <label
              style={{
                display: 'inline-block',
                padding: '12px 28px',
                borderRadius: 14,
                background: '#0071e3',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 113, 227, 0.3)',
              }}
            >
              <span>选择音视频文件</span>
              <input
                type="file"
                accept="video/*,audio/*"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) handleFileSelected(e.target.files[0]);
                }}
                style={{ display: 'none' }}
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSampleVideo}
              style={{
                padding: '12px 20px',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sparkles size={16} color="#0071e3" />
              <span>载入示例演示视频</span>
            </button>
          </div>
        </section>
      )}
    </ToolPage>
  );
}
