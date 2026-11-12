import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  computeCandidateScore,
  parseRegisteredTools,
  runDemandScout,
  runProductArchitect,
  runToolBuilderVerify,
  runQaInspectorScan,
  runReleaseEngineerGate,
  runOperationMonitorCheck,
} from '../scripts/tool-factory/roles.mjs';

const rootDir = process.cwd();

test('NOVIP Tool Factory: 01. Demand Scout scores 6 dimensions and detects registered tools', () => {
  const candidatesData = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'scripts/tool-factory/candidates.json'), 'utf8'),
  );
  const registrySource = fs.readFileSync(path.join(rootDir, 'src/tools/registry.ts'), 'utf8');

  const tools = parseRegisteredTools(registrySource);
  assert.ok(tools.length >= 39, `Expected >= 39 tools in registry, got ${tools.length}`);

  const scout = runDemandScout({
    candidatesData,
    registrySource,
    targetToolId: 'ppt-extract',
  });

  assert.equal(scout.role, '01. Demand Scout');
  assert.ok(scout.selectedCandidate);
  assert.equal(scout.selectedCandidate.id, 'ppt-extract');
  assert.equal(scout.selectedCandidate.alreadyRegistered, true);
  assert.ok(scout.selectedCandidate.compositeScore >= 90);

  // When no targetToolId is forced, Demand Scout selects the highest-scored queued candidate
  const nextQueuedScout = runDemandScout({
    candidatesData,
    registrySource,
  });
  assert.ok(nextQueuedScout.selectedCandidate);
  assert.equal(nextQueuedScout.selectedCandidate.alreadyRegistered, false);
  assert.equal(nextQueuedScout.selectedCandidate.status, 'queued');
});

test('NOVIP Tool Factory: 02. Product Architect generates complete specification & SEO contract', () => {
  const candidatesData = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'scripts/tool-factory/candidates.json'), 'utf8'),
  );
  const pptCandidate = candidatesData.candidates.find((c: { id: string }) => c.id === 'ppt-extract');
  const architect = runProductArchitect(pptCandidate);

  assert.equal(architect.role, '02. Product Architect');
  assert.equal(architect.spec.route, '/tools/ppt-extract');
  assert.ok(architect.spec.seoMeta.canonical.endsWith('/tools/ppt-extract'));
  assert.ok(architect.spec.acceptanceCriteria.length >= 5);
});

test('NOVIP Tool Factory: 03. Tool Builder verifies ppt-extract wiring across registry, router, SEO, and tests', () => {
  const builder = runToolBuilderVerify({
    rootDir,
    toolId: 'ppt-extract',
  });

  assert.equal(builder.passed, true);
  assert.equal(builder.checks.inRegistry, true);
  assert.equal(builder.checks.inMainRouter, true);
  assert.equal(builder.checks.inSeoMap, true);
  assert.equal(builder.checks.inSearchSynonyms, true);
  assert.equal(builder.checks.hasCoreModule, true);
  assert.equal(builder.checks.hasUnitTest, true);
});

test('NOVIP Tool Factory: 04. QA Inspector scans all tools and passes with zero privacy/security violations', () => {
  const qa = runQaInspectorScan({ rootDir });
  assert.equal(qa.passed, true, `Unexpected QA violations: ${JSON.stringify(qa.violations)}`);
  assert.equal(qa.violations.length, 0);
});

test('NOVIP Tool Factory: 05. Release Engineer allows safe tool changes and blocks sensitive files or tool deletions', () => {
  const safeGate = runReleaseEngineerGate({
    changedFiles: [
      'src/tools/PptExtract.tsx',
      'src/tools/ppt-extract-core.ts',
      'src/tools/registry.ts',
      'tests/ppt-extract.test.ts',
    ],
    previousToolIds: ['word-count', 'timetable', 'image-watermark'],
    currentToolIds: ['word-count', 'timetable', 'image-watermark', 'ppt-extract'],
  });
  assert.equal(safeGate.autoMergeAllowed, true);
  assert.equal(safeGate.requiresManualApproval, false);

  // Sensitive file touch (.env.production or edge-functions/) must block auto-merge
  const envBlocked = runReleaseEngineerGate({
    changedFiles: ['src/tools/PptExtract.tsx', '.env.production'],
    previousToolIds: ['word-count'],
    currentToolIds: ['word-count', 'ppt-extract'],
  });
  assert.equal(envBlocked.autoMergeAllowed, false);
  assert.equal(envBlocked.requiresManualApproval, true);
  assert.equal(envBlocked.sensitiveTouches.length, 1);

  // Deleting an existing tool must block auto-merge
  const deletionBlocked = runReleaseEngineerGate({
    changedFiles: ['src/tools/registry.ts'],
    previousToolIds: ['word-count', 'timetable'],
    currentToolIds: ['word-count'],
  });
  assert.equal(deletionBlocked.autoMergeAllowed, false);
  assert.deepEqual(deletionBlocked.removedTools, ['timetable']);
});

test('NOVIP Tool Factory: 06. Operation Monitor checks endpoint health and flags rollback on HTTP failure', async () => {
  const healthyMonitor = await runOperationMonitorCheck({
    baseUrl: 'https://novip.site',
    routes: ['/', '/tools/ppt-extract'],
    fetchImpl: async () =>
      ({
        status: 200,
        text: async () => '<!doctype html><html><head><title>NOVIP</title></head><body>ok</body></html>',
      }) as unknown as Response,
  });
  assert.equal(healthyMonitor.allHealthy, true);
  assert.equal(healthyMonitor.rollbackRecommended, false);

  const degradedMonitor = await runOperationMonitorCheck({
    baseUrl: 'https://novip.site',
    routes: ['/', '/tools/ppt-extract'],
    fetchImpl: async (url: string) =>
      ({
        status: String(url).includes('ppt-extract') ? 502 : 200,
        text: async () => (String(url).includes('ppt-extract') ? 'Bad Gateway' : '<!doctype html><html><body>ok-healthy-home</body></html>'),
      }) as unknown as Response,
  });
  assert.equal(degradedMonitor.allHealthy, false);
  assert.equal(degradedMonitor.rollbackRecommended, true);
  assert.ok(computeCandidateScore({ frequency: 9, searchDemand: 9, frontendFeasibility: 9, privacyAdvantage: 9, lowMaintenanceCost: 9, uniqueness: 9 }) === 90);
});
