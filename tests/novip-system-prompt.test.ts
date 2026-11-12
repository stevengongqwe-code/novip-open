/**
 * NOVIP_SYSTEM_PROMPT 客户端/服务端双份提示词契约测试。
 * 运行：node --import tsx --test tests/novip-system-prompt.test.ts
 *
 * 背景：同一份系统提示词存在两份拷贝——浏览器端 src/tools/ai-api-client.ts
 *（直连 Gemini/智谱/SiliconFlow 时注入）与服务端 edge-functions/api/ai/chat.js
 *（EdgeOne 中转时注入）。两份拷贝无任何机制保证同步， drift 会导致同一用户
 *在两种路径下得到不一致的 AI 行为（工具跳转标签、工具清单口径）。
 * 本文件只锁定契约，不改生产代码。
 *
 * 已知漂移（测试不锁数字，只锁形状；是否统一为产品决策，见 DEVLOG）：
 * 客户端数量行称 46 款、服务端称 52 款，而 registry 实际已有 62 款工具，
 * 三处口径均不一致；服务端工具对照行比客户端多 4 行
 *（id-card-layout / pdf-merge-split / pdf-compress / photo-check）。
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {NOVIP_SYSTEM_PROMPT} from '../src/tools/ai-api-client.ts';
import {tools} from '../src/tools/registry.ts';

const dir = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(resolve(dir, '..', 'edge-functions/api/ai/chat.js'), 'utf8');
const serverPrompt = serverSource.match(/NOVIP_SYSTEM_PROMPT = `([\s\S]*?)`;/)?.[1] ?? '';
const registryIds = new Set(tools.map((t) => t.id));
const toolLines = (prompt: string): string[] =>
  prompt.split('\n').filter((line) => line.startsWith('- '));
const toolIdOf = (line: string): string => line.slice(2).split(':')[0].trim();

test('客户端首行身份句逐字锁定', () => {
  assert.equal(
    NOVIP_SYSTEM_PROMPT.split('\n')[0],
    '你是 NOVIP 助手（No VIP Assistant），专门面向中国大学生的免费学业、生活与文件处理 AI 助手。',
  );
});

test('客户端宗旨行逐字锁定', () => {
  assert.equal(NOVIP_SYSTEM_PROMPT.split('\n')[1], '网站核心宗旨是：「大学生，别花冤枉钱。」');
});

test('客户端数量行只锁形状不锁数字（46/52/62 三处口径已知不一致）', () => {
  const line = NOVIP_SYSTEM_PROMPT.split('\n')[2];
  assert.match(line, /^网站收录了 \d+ 款高频纯前端免充值、无需登录、端侧处理文件的精品工具。$/);
  assert.equal(line.includes('46'), true);
});

test('客户端三条核心原则逐字锁定', () => {
  const lines = NOVIP_SYSTEM_PROMPT.split('\n');
  assert.equal(
    lines[5],
    '1. 语言真诚、清晰、接地气，直击大学生痛点，拒绝官话套话，给出第一步点哪里的实操指导；',
  );
  assert.equal(
    lines[6],
    '2. 当用户的问题可以通过 NOVIP 站内现有工具解决时，请在回答中包含特殊的工具跳转标签：[NOVIP_TOOL:工具ID]（例如提到报名照时附带 [NOVIP_TOOL:photo]，多份PDF合并附带 [NOVIP_TOOL:files]）；',
  );
  assert.equal(
    lines[7],
    '3. 擅长帮学生起草生病请假文案、开题与毕业答辩PPT大纲、期末成绩与GPA反推计算、参考文献 GB/T 7714 排版、简历求职、公式推导与代码编写。',
  );
});

test('客户端工具对照行：22 行、无重复 ID、全部在 registry', () => {
  const lines = toolLines(NOVIP_SYSTEM_PROMPT);
  assert.equal(lines.length, 22);
  const ids = lines.map(toolIdOf);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(registryIds.has(id), `提示词工具 ${id} 不在 registry`);
});

test('跳转标签格式：示例存在且全部标签的工具 ID 均在 registry', () => {
  assert.ok(NOVIP_SYSTEM_PROMPT.includes('[NOVIP_TOOL:photo]'));
  assert.ok(NOVIP_SYSTEM_PROMPT.includes('[NOVIP_TOOL:files]'));
  const tags = [...NOVIP_SYSTEM_PROMPT.matchAll(/\[NOVIP_TOOL:([a-z0-9-]+)\]/g)].map((m) => m[1]);
  assert.ok(tags.length >= 2);
  for (const id of tags) assert.ok(registryIds.has(id), `跳转标签工具 ${id} 不在 registry`);
});

test('客户端提示词结构下限：以 wishes 行结尾、未被截断', () => {
  assert.ok(NOVIP_SYSTEM_PROMPT.trimEnd().endsWith('- wishes: 功能许愿池'));
  assert.ok(NOVIP_SYSTEM_PROMPT.length > 1000);
  assert.ok(NOVIP_SYSTEM_PROMPT.split('\n').length >= 30);
  assert.ok(!NOVIP_SYSTEM_PROMPT.includes('${'));
  assert.ok(!NOVIP_SYSTEM_PROMPT.includes('TODO'));
});

test('服务端文件内能提取出提示词模板', () => {
  assert.ok(serverPrompt.length > 1000);
  assert.ok(serverSource.includes('NOVIP_SYSTEM_PROMPT'));
});

test('服务端首行与宗旨行与客户端逐字相同', () => {
  const client = NOVIP_SYSTEM_PROMPT.split('\n');
  const server = serverPrompt.split('\n');
  assert.equal(server[0], client[0]);
  assert.equal(server[1], client[1]);
});

test('服务端三条核心原则与客户端逐字相同', () => {
  const client = NOVIP_SYSTEM_PROMPT.split('\n');
  const server = serverPrompt.split('\n');
  assert.equal(server[5], client[5]);
  assert.equal(server[6], client[6]);
  assert.equal(server[7], client[7]);
});

test('服务端数量行只锁形状不锁数字（服务端称 52 款）', () => {
  const line = serverPrompt.split('\n')[2];
  assert.match(line, /^网站收录了 \d+ 款高频纯前端免充值、无需登录、端侧处理文件的精品工具。$/);
  assert.equal(line.includes('52'), true);
});

test('服务端工具对照行：26 行、无重复 ID、全部在 registry', () => {
  const lines = toolLines(serverPrompt);
  assert.equal(lines.length, 26);
  const ids = lines.map(toolIdOf);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(registryIds.has(id), `服务端提示词工具 ${id} 不在 registry`);
});

test('客户端工具对照行是服务端工具对照行的子集（双份拷贝同步契约）', () => {
  const serverLines = new Set(toolLines(serverPrompt));
  for (const line of toolLines(NOVIP_SYSTEM_PROMPT)) {
    assert.ok(serverLines.has(line), `客户端工具行缺失于服务端提示词：${line}`);
  }
});

test('服务端提示词无模板占位符残留且以 wishes 行结尾', () => {
  assert.ok(serverPrompt.trimEnd().endsWith('- wishes: 功能许愿池'));
  assert.ok(!serverPrompt.includes('${'));
  assert.ok(!serverPrompt.includes('TODO'));
});
