import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommandPalette} from '../src/motion/components/CommandPalette';
import {OfflineReadyBadge} from '../src/motion/components/OfflineReadyBadge';

describe('CommandPalette & OfflineReadyBadge Components', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(CommandPalette, {
        open: false,
        onClose: () => {},
      })
    );
    assert.equal(html, '');
  });

  it('renders search input and shortcut hint when open', () => {
    const html = renderToStaticMarkup(
      React.createElement(CommandPalette, {
        open: true,
        onClose: () => {},
      })
    );
    assert.ok(html.includes('搜索全站 60+ 款免充值工具'));
    assert.ok(html.includes('ESC 关闭'));
    assert.ok(html.includes('↑↓ 切换'));
    assert.ok(html.includes('↵ 直达'));
  });

  it('renders OfflineReadyBadge with 100% local computing badge', () => {
    const html = renderToStaticMarkup(React.createElement(OfflineReadyBadge));
    assert.ok(html.includes('端侧运算池已就绪'));
  });
});
