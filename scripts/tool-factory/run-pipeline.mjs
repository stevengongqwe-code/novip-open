#!/usr/bin/env node
/**
 * NOVIP TOOL FACTORY — End-to-End Automated Pipeline Runner
 * Executes the 6 logical roles:
 *   01. Demand Scout
 *   02. Product Architect
 *   03. Tool Builder (verification)
 *   04. QA Inspector (static privacy & security scan)
 *   05. Release Engineer (sensitive file & tool-deletion gate)
 *   06. Operation Monitor (build artifact or live production readiness)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  parseRegisteredTools,
  runDemandScout,
  runProductArchitect,
  runToolBuilderVerify,
  runQaInspectorScan,
  runReleaseEngineerGate,
} from './roles.mjs';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const verifyArg = args.find((a) => a.startsWith('--verify-tool='));
const targetToolId = verifyArg ? verifyArg.split('=')[1] : 'ppt-extract';

function safeGitDiffFiles() {
  try {
    const out = execSync('git diff --name-only origin/main...HEAD || git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((line) => line.replace(/^[ MARC?U]{1,2}\s+/, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeMainRegistryTools() {
  try {
    const mainRegistry = execSync('git show origin/main:src/tools/registry.ts', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseRegisteredTools(mainRegistry).map((t) => t.id);
  } catch {
    return [];
  }
}

function main() {
  const candidatesPath = path.join(rootDir, 'scripts/tool-factory/candidates.json');
  const registryPath = path.join(rootDir, 'src/tools/registry.ts');

  const candidatesData = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  const registrySource = fs.readFileSync(registryPath, 'utf8');
  const currentTools = parseRegisteredTools(registrySource);

  // 01. Demand Scout
  const scoutReport = runDemandScout({
    candidatesData,
    registrySource,
    targetToolId,
  });

  // 02. Product Architect
  const architectReport = runProductArchitect(scoutReport.selectedCandidate);

  // 03. Tool Builder Verification
  const builderReport = runToolBuilderVerify({
    rootDir,
    toolId: targetToolId,
  });

  // 04. QA Inspector Scan
  const qaReport = runQaInspectorScan({ rootDir });

  // 05. Release Engineer Gate
  const changedFiles = safeGitDiffFiles();
  const previousToolIds = safeMainRegistryTools();
  const releaseReport = runReleaseEngineerGate({
    changedFiles,
    previousToolIds,
    currentToolIds: currentTools.map((t) => t.id),
  });

  // 06. Operation Monitor (Pre-rendered dist check if dist/ exists)
  const distToolHtml = path.join(rootDir, 'dist/tools', targetToolId, 'index.html');
  const distHomeHtml = path.join(rootDir, 'dist/index.html');
  const distReady = fs.existsSync(distToolHtml) && fs.existsSync(distHomeHtml);

  const monitorReport = {
    role: '06. Operation Monitor (Pre-Deploy Artifact Check)',
    timestamp: new Date().toISOString(),
    distReady,
    checkedPaths: [
      { path: 'dist/index.html', exists: fs.existsSync(distHomeHtml) },
      { path: `dist/tools/${targetToolId}/index.html`, exists: fs.existsSync(distToolHtml) },
      { path: 'dist/sitemap.xml', exists: fs.existsSync(path.join(rootDir, 'dist/sitemap.xml')) },
    ],
  };

  const overallPassed =
    Boolean(scoutReport.selectedCandidate) &&
    builderReport.passed &&
    qaReport.passed &&
    releaseReport.autoMergeAllowed;

  const pipelineSummary = {
    pipeline: 'NOVIP TOOL FACTORY v1.0',
    executedAt: new Date().toISOString(),
    targetToolId,
    overallPassed,
    roles: {
      demandScout: scoutReport,
      productArchitect: architectReport,
      toolBuilder: builderReport,
      qaInspector: qaReport,
      releaseEngineer: releaseReport,
      operationMonitor: monitorReport,
    },
  };

  const reportDir = path.join(rootDir, 'reports/factory-runs');
  fs.mkdirSync(reportDir, { recursive: true });
  const latestReportPath = path.join(reportDir, 'latest.json');
  fs.writeFileSync(latestReportPath, `${JSON.stringify(pipelineSummary, null, 2)}\n`, 'utf8');

  console.log(`[NOVIP TOOL FACTORY] Target tool: ${targetToolId}`);
  console.log(`  01. Demand Scout      : Score ${scoutReport.selectedCandidate?.compositeScore ?? 'N/A'} / 100 (${scoutReport.selectedCandidate?.title ?? 'none'})`);
  console.log(`  02. Product Architect : Route ${architectReport.spec.route}`);
  console.log(`  03. Tool Builder      : ${builderReport.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  04. QA Inspector      : ${qaReport.passed ? 'PASS' : 'FAIL'} (${qaReport.scannedFileCount} files scanned, ${qaReport.violations.length} violations)`);
  console.log(`  05. Release Engineer  : ${releaseReport.autoMergeAllowed ? 'PASS (Auto-Merge Allowed)' : 'BLOCKED (Manual Approval Required)'}`);
  console.log(`  06. Operation Monitor : distReady=${distReady}`);
  console.log(`  Report written to     : ${path.relative(rootDir, latestReportPath)}`);

  if (!overallPassed) {
    process.exitCode = 1;
  }
}

main();
