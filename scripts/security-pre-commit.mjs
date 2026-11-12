#!/usr/bin/env node
/**
 * NOVIP 本地 Git 提交前轻量级安全校验脚本 (Zero-Cost Pre-Commit Security Hook)
 * 检查暂存区代码中是否存在高危敏感凭据（API Keys、私钥、Token 等）。
 * 优先调用本地 gitleaks，若未安装则执行零依赖内置启发式正则匹配。
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

function hasGitleaks() {
  return run('command -v gitleaks') !== null;
}

console.log('[security:pre-commit] 正在扫描暂存区敏感信息...');

if (hasGitleaks()) {
  const configFile = resolve(process.cwd(), '.gitleaks.toml');
  const configArg = existsSync(configFile) ? `--config "${configFile}"` : '';
  try {
    execSync(`gitleaks protect --staged --redact ${configArg}`, { stdio: 'inherit' });
    console.log('[security:pre-commit] ✓ Gitleaks 暂存区扫描通过，未发现敏感信息泄露！');
    process.exit(0);
  } catch (err) {
    console.error('\n[security:pre-commit] ❌ 警告：检测到疑似敏感凭据泄露，已拦截提交！');
    console.error('请检查暂存代码并清理密钥，或确认是否为配置误报。');
    process.exit(1);
  }
} else {
  // 零依赖启发式回退检测
  const stagedDiff = run('git diff --cached --unified=0');
  if (!stagedDiff) {
    console.log('[security:pre-commit] 暂存区无代码变更，跳过。');
    process.exit(0);
  }

  const suspiciousPatterns = [
    { name: 'Google API Key', regex: /AIzaSy[0-9A-Za-z_-]{33}/ },
    { name: 'RSA/Private Key', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'GitHub Token', regex: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/ },
    { name: 'Generic AWS Secret', regex: /(aws_secret_access_key|aws_access_key_id)\s*=\s*['"][A-Za-z0-9/+=]{20,}['"]/i }
  ];

  const addedLines = stagedDiff
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'));

  let found = false;
  for (const line of addedLines) {
    // 忽略白名单注释或测试模拟行
    if (line.includes('mock_key') || line.includes('test_key') || line.includes('NAV_FAVORITES_KEY')) continue;

    for (const pat of suspiciousPatterns) {
      if (pat.regex.test(line)) {
        console.error(`[security:pre-commit] ❌ 检测到疑似 ${pat.name} 泄露！`);
        console.error(`   匹配行 (已脱敏): ${line.slice(0, 15)}...***`);
        found = true;
      }
    }
  }

  if (found) {
    console.error('[security:pre-commit] 拦截提交：请清除敏感信息后再提交。');
    process.exit(1);
  }

  console.log('[security:pre-commit] ✓ 启发式安全预检通过（建议本地安装 gitleaks 获得更强保护）。');
  process.exit(0);
}
