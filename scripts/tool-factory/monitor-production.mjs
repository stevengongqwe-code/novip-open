#!/usr/bin/env node
/**
 * NOVIP Operation Monitor — Live Production Verification Script
 * Checks key routes on https://novip.site, verifies HTTP 200 and deploy-info.json SHA,
 * and emits rollback recommendations if any critical route fails.
 */

import { runOperationMonitorCheck } from './roles.mjs';

const args = process.argv.slice(2);
const baseUrlArg = args.find((a) => a.startsWith('--base-url='));
const expectedShaArg = args.find((a) => a.startsWith('--expect-sha='));

const baseUrl = baseUrlArg ? baseUrlArg.split('=')[1] : 'https://novip.site';
const expectedSha = expectedShaArg ? expectedShaArg.split('=')[1] : '';

async function main() {
  const report = await runOperationMonitorCheck({ baseUrl });

  let deployInfo = null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/deploy-info.json?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      deployInfo = await res.json();
    }
  } catch {
    deployInfo = null;
  }

  const shaMatched =
    !expectedSha ||
    (deployInfo &&
      typeof deployInfo.commit === 'string' &&
      deployInfo.commit.startsWith(expectedSha));

  const output = {
    ...report,
    deployInfo,
    expectedSha: expectedSha || null,
    shaMatched,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!report.allHealthy || !shaMatched) {
    process.exitCode = 1;
  }
}

main();
