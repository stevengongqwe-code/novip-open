/**
 * edge-functions/api/ai/chat.js
 * NOVIP 助手 · 腾讯云 EdgeOne 边缘大模型中转与代理服务
 *
 * 核心功能：
 * 1. 站长级统一托管：利用 EdgeOne 边缘计算节点全球直连 Google Gemini API，彻底解决国内访问被墙、CORS 拦截问题；
 * 2. 凭据隔离：GEMINI_API_KEY 保存在 EdgeOne 环境变量或服务端凭据中，绝不暴露给客户端浏览器；
 * 3. 灵活回退与自定义：优先使用服务端配置的全局 Key；同时支持调用端通过请求头 x-gemini-key 传入自定义私有 Key；
 * 4. 防刷频与安全防护：限制同域请求来源（Origin / Sec-Fetch-Site），内置 IP 级防刷频限流（默认 30 次/分钟）；
 * 5. 提示词增强：自动注入 NOVIP 大学生工具箱 System Prompt 与工具推荐指令。
 */

const NOVIP_SYSTEM_PROMPT = `你是 NOVIP 助手（No VIP Assistant），专门面向中国大学生的免费学业、生活与文件处理 AI 助手。
网站核心宗旨是：「大学生，别花冤枉钱。」
网站收录了 52 款高频纯前端免充值、无需登录、端侧处理文件的精品工具。

你的核心原则：
1. 语言真诚、清晰、接地气，直击大学生痛点，拒绝官话套话，给出第一步点哪里的实操指导；
2. 当用户的问题可以通过 NOVIP 站内现有工具解决时，请在回答中包含特殊的工具跳转标签：[NOVIP_TOOL:工具ID]（例如提到报名照时附带 [NOVIP_TOOL:photo]，多份PDF合并附带 [NOVIP_TOOL:files]）；
3. 擅长帮学生起草生病请假文案、开题与毕业答辩PPT大纲、期末成绩与GPA反推计算、参考文献 GB/T 7714 排版、简历求职、公式推导与代码编写。

站内常用核心工具ID与功能对照：
- photo: 蓝底/红底一寸二寸报名照制作，锁定100KB以内
- id-card-layout: 身份证正反面1:1 A4纸排版打印与防盗水印
- files: PDF合并、拆分、旋转、转Word/PPT
- pdf-merge-split: 多份课件论文合并为一个，按页码范围拆分或提取指定页
- pdf-compress: 按轻度/推荐/极限档位重采样压缩 PDF
- photo-check: 报名照片体检诊断，尺寸KB合规性自检
- timetable: 大学课程表排课与导出手机日历（ICS/Wakeup）
- leave-helper: 向辅导员和老师请假合规理由与微信措辞生成
- ppt-generate: 论文答辩、开题报告、课程设计 PPT 智能大纲与一键导出
- pdf-form: 奖学金申请表、审批表免打印在线打字填写与手写电子签名
- image-compress: 学信网、考研网图片精准压缩到指定 KB
- web-to-apk: 网页一键打包安卓 APK 安装包与 PWA 套件
- material-collector: 班长收作业与材料名单比对
- file-organizer: 考研/答辩材料批量重命名与编号
- docx-check: 毕业论文格式与排版规范自检
- references: 参考文献 GB/T 7714 规范生成
- grades: 平时分反推期末需考多少分、GPA绩点换算
- flowchart: Mermaid 算法、时序图、系统架构流程图制作
- media-converter: 视频提取 MP3、网课录音转音频、GIF动图制作
- handwrite: 打印文字转大学软面抄、方格信笺手写图片
- background: 证件照纯端侧红白蓝抠图换底色
- ocr: 图片与扫描件文字识别提取
- developer: JSON/Base64/URL/SHA256/UUID 开发者小工具
- college-nav: 全国高校教务系统与研招网直达导航
- cost: 商业软件收费替代与成本计算
- wishes: 功能许愿池`;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });

function permitted(request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).hostname;
      const requestHost = new URL(request.url).hostname;
      // 允许本地开发与生产域名
      if (originHost !== requestHost && !originHost.endsWith('novip.site') && originHost !== 'localhost' && originHost !== '127.0.0.1') {
        return false;
      }
    } catch {
      return false;
    }
  }
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

const recentRequests = new Map();

function isRateLimited(key) {
  const now = Date.now();
  const windowMs = 60000;
  const maxPerWindow = 30; // 限制每个 IP 每分钟 30 次调用，防止额度被恶意刷爆
  const history = (recentRequests.get(key) || []).filter(t => now - t < windowMs);
  if (history.length >= maxPerWindow) {
    return true;
  }
  if (recentRequests.size > 2000) {
    recentRequests.clear();
  }
  recentRequests.set(key, [...history, now]);
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!permitted(request)) {
    return json({ ok: false, error: 'FORBIDDEN', message: '跨域请求已被安全策略拦截' }, 403);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return json({ ok: false, error: 'INVALID_CONTENT_TYPE', message: '请发送 application/json 格式' }, 415);
  }

  const clientIp = request.eo?.clientIp || request.headers.get('x-forwarded-for') || request.headers.get('user-agent') || 'anonymous';
  if (isRateLimited(clientIp)) {
    return json({ ok: false, error: 'RATE_LIMITED', message: '请求过于频繁，请稍候再试（每分钟限额 30 次）' }, 429);
  }

  let body;
  try {
    const rawText = await request.text();
    if (rawText.length > 32768) {
      return json({ ok: false, error: 'PAYLOAD_TOO_LARGE', message: '请求内容超过大小限制' }, 413);
    }
    body = JSON.parse(rawText);
  } catch {
    return json({ ok: false, error: 'INVALID_JSON', message: 'JSON 解析失败' }, 400);
  }

  const { query, prompt, history = [], model = 'gemini-1.5-flash', temperature = 0.7 } = body || {};
  const userText = (query || prompt || '').trim();

  // 若仅为健康探测 / Ping 请求
  if (userText === 'Ping') {
    return json({ ok: true, message: 'NOVIP Edge AI 路由网关运行正常！' }, 200);
  }

  if (!userText) {
    return json({ ok: false, error: 'EMPTY_PROMPT', message: '提问内容不能为空' }, 400);
  }

  // 1. 获取 Gemini API Key：优先使用自定义传入 Header，其次使用 EdgeOne 环境变量注入（严格杜绝代码库硬编码）
  const customHeaderKey = request.headers.get('x-gemini-key')?.trim();
  const serverKey = (env?.GEMINI_API_KEY !== undefined ? env.GEMINI_API_KEY : (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : ''))?.trim();
  const apiKey = customHeaderKey || serverKey;

  if (!apiKey) {
    return json(
      {
        ok: false,
        error: 'NO_KEY_CONFIGURED',
        message: 'NOVIP 服务端未配置 GEMINI_API_KEY，且客户端未传入私有 Key。',
        needConfig: true,
      },
      503
    );
  }

  // 模型版本自动对齐：向后兼容 gemini-1.5-flash 与 2.0，默认映射至免限流高可用的 gemini-flash-lite-latest
  const targetModel = (!model || model === 'gemini-1.5-flash' || model === 'gemini-2.0-flash')
    ? 'gemini-flash-lite-latest'
    : model;

  // 2. 组装请求至 Google Gemini 官方端点
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    targetModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-6)) {
      if (typeof msg?.content === 'string' && msg.content.trim()) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content.trim() }],
        });
      }
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: userText }],
  });

  try {
    let googleRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: NOVIP_SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: typeof temperature === 'number' ? Math.max(0, Math.min(1, temperature)) : 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    // 若目标模型返回 404/503，自动降级至 gemini-flash-lite-latest 备选模型重试
    if ((googleRes.status === 404 || googleRes.status === 503) && targetModel !== 'gemini-flash-lite-latest') {
      const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${encodeURIComponent(apiKey)}`;
      googleRes = await fetch(fallbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: NOVIP_SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: typeof temperature === 'number' ? Math.max(0, Math.min(1, temperature)) : 0.7,
            maxOutputTokens: 2048,
          },
        }),
      });
    }

    if (!googleRes.ok) {
      const errDetail = await googleRes.text();
      let parsedErr = errDetail;
      try {
        const errJson = JSON.parse(errDetail);
        parsedErr = errJson?.error?.message || errDetail;
      } catch {
        /* keep text */
      }

      if (googleRes.status === 429) {
        return json(
          {
            ok: false,
            error: 'QUOTA_EXCEEDED',
            message: 'Gemini 官方免费配额触达速率限制，请稍等片刻再试。',
            detail: parsedErr.slice(0, 200),
          },
          429
        );
      }

      if (googleRes.status === 400 || googleRes.status === 403) {
        return json(
          {
            ok: false,
            error: 'INVALID_API_KEY',
            message: 'Gemini API Key 校验不通过或权限不足，请检查密钥是否正确生效。',
            detail: parsedErr.slice(0, 200),
          },
          googleRes.status
        );
      }

      return json(
        {
          ok: false,
          error: `GOOGLE_HTTP_${googleRes.status}`,
          message: `Google Gemini 接口响应错误: ${parsedErr.slice(0, 200)}`,
        },
        502
      );
    }

    const data = await googleRes.json();
    const rawParts = data?.candidates?.[0]?.content?.parts;
    const replyText = Array.isArray(rawParts)
      ? rawParts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('').trim()
      : '';

    if (!replyText || typeof replyText !== 'string') {
      return json({ ok: false, error: 'EMPTY_REPLY', message: 'Gemini 未生成文本回答' }, 500);
    }

    return json({
      ok: true,
      reply: replyText,
      model: targetModel,
      provider: 'gemini',
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    return json(
      {
        ok: false,
        error: 'UPSTREAM_NETWORK_ERROR',
        message: `EdgeOne 连接 Google Gemini 发生网络异常: ${msg}`,
      },
      504
    );
  }
}

export function onRequestGet() {
  return json({
    ok: true,
    service: 'NOVIP Edge AI Chat Gateway',
    version: '1.0.0',
    model: 'gemini-1.5-flash / gemini-2.0-flash',
    status: 'ready',
  });
}
