/**
 * Markdown 转微信公众号排版小助手 · 内联样式渲染与微信富文本引擎
 * 零第三方体积依赖，直接输出包含 inline-styles 的 HTML
 */

export type WechatThemeId = 'academic-blue' | 'emerald-fresh' | 'minimal-ink' | 'warm-sunset';

export interface WechatTheme {
  id: WechatThemeId;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  quoteBg: string;
  codeBg: string;
}

export const WECHAT_THEMES: WechatTheme[] = [
  {
    id: 'academic-blue',
    name: '大学学术蓝 (推荐)',
    primaryColor: '#0071e3',
    secondaryColor: '#e0f2fe',
    quoteBg: '#f0f9ff',
    codeBg: '#f8fafc',
  },
  {
    id: 'emerald-fresh',
    name: '校园清新绿',
    primaryColor: '#059669',
    secondaryColor: '#d1fae5',
    quoteBg: '#ecfdf5',
    codeBg: '#f0fdf4',
  },
  {
    id: 'minimal-ink',
    name: '极简典雅黑',
    primaryColor: '#1e293b',
    secondaryColor: '#f1f5f9',
    quoteBg: '#f8fafc',
    codeBg: '#f1f5f9',
  },
  {
    id: 'warm-sunset',
    name: '晚霞橙红 (社团/活动)',
    primaryColor: '#ea580c',
    secondaryColor: '#ffedd5',
    quoteBg: '#fff7ed',
    codeBg: '#fef2f2',
  },
];

export function renderMarkdownToWechatHtml(markdown: string, themeId: WechatThemeId = 'academic-blue'): string {
  const theme = WECHAT_THEMES.find((t) => t.id === themeId) || WECHAT_THEMES[0];
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];

  const baseFont = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; line-height: 1.8; color: #2d3748;";

  htmlParts.push(`<section style="${baseFont} max-width: 677px; margin: 0 auto; padding: 12px; font-size: 15px;">`);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue;
    }

    // H1
    if (trimmed.startsWith('# ')) {
      const text = parseInline(trimmed.slice(2));
      htmlParts.push(
        `<h1 style="font-size: 20px; font-weight: bold; color: ${theme.primaryColor}; border-bottom: 2px solid ${theme.primaryColor}; padding-bottom: 6px; margin: 24px 0 16px 0; letter-spacing: 0.5px;">${text}</h1>`
      );
      continue;
    }

    // H2
    if (trimmed.startsWith('## ')) {
      const text = parseInline(trimmed.slice(3));
      htmlParts.push(
        `<h2 style="font-size: 17px; font-weight: bold; color: #1e293b; border-left: 4px solid ${theme.primaryColor}; padding-left: 8px; margin: 20px 0 12px 0;">${text}</h2>`
      );
      continue;
    }

    // H3
    if (trimmed.startsWith('### ')) {
      const text = parseInline(trimmed.slice(4));
      htmlParts.push(
        `<h3 style="font-size: 15.5px; font-weight: bold; color: #334155; margin: 16px 0 8px 0;">${text}</h3>`
      );
      continue;
    }

    // Quote Block
    if (trimmed.startsWith('> ')) {
      const text = parseInline(trimmed.slice(2));
      htmlParts.push(
        `<blockquote style="background: ${theme.quoteBg}; border-left: 3px solid ${theme.primaryColor}; padding: 10px 14px; margin: 14px 0; border-radius: 4px; color: #475569; font-size: 14px;">${text}</blockquote>`
      );
      continue;
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const text = parseInline(trimmed.slice(2));
      htmlParts.push(
        `<div style="display: flex; align-items: baseline; margin: 4px 0;"><span style="color: ${theme.primaryColor}; margin-right: 8px;">•</span><span style="flex: 1;">${text}</span></div>`
      );
      continue;
    }

    // Code block backtick
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      htmlParts.push(
        `<pre style="background: ${theme.codeBg}; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; overflow-x: auto; font-family: monospace; font-size: 13px; color: #334155; margin: 12px 0;"><code>${codeLines.join('\n')}</code></pre>`
      );
      continue;
    }

    // Normal Paragraph
    htmlParts.push(
      `<p style="margin: 12px 0; line-height: 1.85; text-align: justify; letter-spacing: 0.3px;">${parseInline(rawLine)}</p>`
    );
  }

  htmlParts.push(`</section>`);
  return htmlParts.join('\n');
}

function parseInline(text: string): string {
  let res = escapeHtml(text);
  // Bold **text**
  res = res.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  res = res.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code `code`
  res = res.replace(/`(.+?)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 90%;">$1</code>');
  return res;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
