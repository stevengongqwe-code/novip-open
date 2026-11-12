import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BlurSplitText} from '../src/motion/components/BlurSplitText';
import {CountUpMetric} from '../src/motion/components/CountUpMetric';
import {AdaptiveDialog} from '../src/motion/components/AdaptiveDialog';
import {TactileDropzone, formatFileSizeBadge} from '../src/motion/components/TactileDropzone';
import {DecryptedText} from '../src/motion/components/DecryptedText';
import {TactileStepper} from '../src/motion/components/TactileStepper';
import {shouldReduceMotion} from '../src/motion/useNovipMotion';

const ROOT = process.cwd();

describe('OPERATION NOVIP UI REVOLUTION — Research & Motion Design System', () => {
  it('verifies docs/ui-revolution/research.md contains 50+ substantive items across all 5 target websites', () => {
    const researchPath = path.join(ROOT, 'docs/ui-revolution/research.md');
    assert.ok(fs.existsSync(researchPath), 'research.md must exist');
    const content = fs.readFileSync(researchPath, 'utf8');

    const itemMatches = content.match(/^### 记录 #\d+/gm) || [];
    assert.ok(
      itemMatches.length >= 110,
      `Expected at least 110 research items, found ${itemMatches.length}`,
    );

    assert.ok(content.includes('motionsites.ai'), 'Must cover Motion Sites');
    assert.ok(content.includes('reactbits.dev'), 'Must cover React Bits');
    assert.ok(content.includes('uiverse.io'), 'Must cover Uiverse');
    assert.ok(content.includes('animejs.com'), 'Must cover Anime.js');
    assert.ok(content.includes('ui.aceternity.com'), 'Must cover Aceternity UI');

    for (const requiredField of [
      '1. 来源网站与具体 URL',
      '2. 功能及视觉效果说明',
      '3. 实现原理',
      '4. 依赖和兼容性',
      '5. 许可证或使用限制',
      '6. 移植成本',
      '7. 性能风险',
      '8. 是否适合 NOVIP',
      '9. 推荐落地位置',
      '10. 最终采用、改造或放弃的原因',
    ]) {
      assert.ok(content.includes(requiredField), `Missing required field: ${requiredField}`);
    }
  });

  it('verifies component-matrix.md and design-system.md exist and define NOVIP Motion Design System tokens', () => {
    const matrixPath = path.join(ROOT, 'docs/ui-revolution/component-matrix.md');
    const dsPath = path.join(ROOT, 'docs/ui-revolution/design-system.md');
    assert.ok(fs.existsSync(matrixPath), 'component-matrix.md must exist');
    assert.ok(fs.existsSync(dsPath), 'design-system.md must exist');

    const tokensCss = fs.readFileSync(path.join(ROOT, 'src/motion/tokens.css'), 'utf8');
    assert.ok(tokensCss.includes('--novip-dur-instant'), 'Must define --novip-dur-instant');
    assert.ok(tokensCss.includes('--novip-ease-spring'), 'Must define --novip-ease-spring');
    assert.ok(tokensCss.includes('--novip-touch-min: 44px'), 'Must enforce 44px touch target');
    assert.ok(tokensCss.includes('prefers-reduced-motion'), 'Must respect prefers-reduced-motion');
  });

  it('renders BlurSplitText, CountUpMetric, AdaptiveDialog, and TactileDropzone cleanly', () => {
    const titleHtml = renderToStaticMarkup(
      React.createElement(BlurSplitText, {
        text: '大学生，别花冤枉钱。',
        chunks: ['大学生，', '别花冤枉钱。'],
      }),
    );
    assert.ok(titleHtml.includes('大学生，'));
    assert.ok(titleHtml.includes('别花冤枉钱。'));

    const metricHtml = renderToStaticMarkup(
      React.createElement(CountUpMetric, {value: 60, suffix: '款'}),
    );
    assert.ok(metricHtml.includes('60款'));

    const closedDialogHtml = renderToStaticMarkup(
      React.createElement(
        AdaptiveDialog,
        {open: false, onClose: () => {}, title: '测试弹窗'},
        React.createElement('p', null, '内容'),
      ),
    );
    assert.equal(closedDialogHtml, '');

    const openDialogHtml = renderToStaticMarkup(
      React.createElement(
        AdaptiveDialog,
        {open: true, onClose: () => {}, title: 'NOVIP 隐私与安全承诺'},
        React.createElement('p', null, '100% 保护隐私'),
      ),
    );
    assert.ok(openDialogHtml.includes('role="dialog"'));
    assert.ok(openDialogHtml.includes('NOVIP 隐私与安全承诺'));

    const dropzoneHtml = renderToStaticMarkup(
      React.createElement(TactileDropzone, {
        onFilesSelected: () => {},
        title: '点击选择文件',
      }),
    );
    assert.ok(dropzoneHtml.includes('novip-tactile-dropzone'));
    assert.equal(formatFileSizeBadge(102400), '100.0 KB');
    assert.equal(typeof shouldReduceMotion(), 'boolean');

    const decryptedHtml = renderToStaticMarkup(
      React.createElement(DecryptedText, {
        text: 'CORE.01 // 零上传算力池就绪',
      }),
    );
    assert.ok(decryptedHtml.includes('novip-decrypted-text'));
    assert.ok(decryptedHtml.includes('CORE.01 // 零上传算力池就绪'));

    const stepperHtml = renderToStaticMarkup(
      React.createElement(TactileStepper, {
        steps: [
          {id: 'upload', label: '选择照片', description: '支持 JPG/PNG'},
          {id: 'adjust', label: '设置尺寸', description: '一寸/二寸/红蓝白'},
          {id: 'download', label: '下载完成', description: '无水印高清导出'},
        ],
        currentStepIndex: 1,
      }),
    );
    assert.ok(stepperHtml.includes('tactile-stepper'));
    assert.ok(stepperHtml.includes('aria-label="操作步骤"'));
    assert.ok(stepperHtml.includes('is-completed'));
    assert.ok(stepperHtml.includes('is-current'));
    assert.ok(stepperHtml.includes('is-pending'));
    assert.ok(stepperHtml.includes('aria-current="step"'));
    assert.ok(stepperHtml.includes('选择照片'));
    assert.ok(stepperHtml.includes('设置尺寸'));
    assert.ok(stepperHtml.includes('下载完成'));
  });
});
