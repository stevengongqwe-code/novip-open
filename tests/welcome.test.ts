import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  WELCOME_KEY,
  isWelcomeDismissed,
  dismissWelcome,
  resetWelcome,
} from '../src/tools/welcome-core';

describe('首次访问小彩蛋 (welcome-core)', () => {
  function createMockStorage(): Storage {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      length: store.size,
    } as Storage;
  }

  it('常量 WELCOME_KEY 符合版本命名规范', () => {
    assert.equal(WELCOME_KEY, 'novip-welcome-v1');
  });

  it('首次访问时，isWelcomeDismissed 返回 false', () => {
    const storage = createMockStorage();
    assert.equal(isWelcomeDismissed(storage), false);
  });

  it('用户点击关闭后，dismissWelcome 将状态写入 storage，后续返回 true', () => {
    const storage = createMockStorage();
    assert.equal(isWelcomeDismissed(storage), false);

    const ok = dismissWelcome(storage);
    assert.equal(ok, true);
    assert.equal(storage.getItem(WELCOME_KEY), 'dismissed');
    assert.equal(isWelcomeDismissed(storage), true);
  });

  it('resetWelcome 可清空提示关闭记录', () => {
    const storage = createMockStorage();
    dismissWelcome(storage);
    assert.equal(isWelcomeDismissed(storage), true);

    resetWelcome(storage);
    assert.equal(isWelcomeDismissed(storage), false);
  });

  it('浏览器隐私模式下 storage 抛出异常时不崩溃，安全降级', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('QuotaExceededError: Private browsing mode');
      },
      setItem: () => {
        throw new Error('SecurityError: Access denied');
      },
      removeItem: () => {
        throw new Error('SecurityError: Access denied');
      },
    };

    assert.equal(isWelcomeDismissed(throwingStorage), false);
    assert.equal(dismissWelcome(throwingStorage), false);
    assert.equal(resetWelcome(throwingStorage), false);
  });
});
