import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoredPinnedTools,
  togglePinnedTool,
  isToolPinned,
  DEFAULT_PINNED,
  PINNED_STORAGE_KEY,
} from '../src/tools/pinned-core';

describe('PinnedToolsCore — 大学生常备工具箱持久化', () => {
  it('returns default pinned tools in non-browser environment', () => {
    const list = getStoredPinnedTools();
    assert.deepEqual(list, DEFAULT_PINNED);
    assert.equal(isToolPinned('photo'), true);
  });

  describe('with mocked localStorage and window', () => {
    let mockStore: Record<string, string> = {};

    beforeEach(() => {
      mockStore = {};
      const mockStorage = {
        getItem: (k: string) => mockStore[k] || null,
        setItem: (k: string, v: string) => {
          mockStore[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStore[k];
        },
      };

      (globalThis as any).window = {
        localStorage: mockStorage,
        dispatchEvent: () => true,
      };
    });

    afterEach(() => {
      delete (globalThis as any).window;
    });

    it('toggles tools on and off cleanly', () => {
      // initially empty store -> returns DEFAULT_PINNED
      assert.deepEqual(getStoredPinnedTools(), DEFAULT_PINNED);

      // toggle adding 'focus'
      const updated = togglePinnedTool('focus');
      assert.ok(updated.includes('focus'));
      assert.equal(isToolPinned('focus'), true);
      assert.ok(mockStore[PINNED_STORAGE_KEY].includes('focus'));

      // toggle removing 'focus'
      const removed = togglePinnedTool('focus');
      assert.ok(!removed.includes('focus'));
      assert.equal(isToolPinned('focus'), false);
    });
  });
});
