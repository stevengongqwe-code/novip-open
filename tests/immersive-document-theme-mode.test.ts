import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  IMMERSION_THEME_STORAGE_KEY,
  applyDocumentThemeMode,
  loadSavedThemeMode,
  saveThemeMode,
} from '../src/immersive/capability.ts';
import type {VisualThemeMode} from '../src/immersive/capability.ts';

// applyDocumentThemeMode 是 Phase 4 全站沉浸式主题模式落到 DOM 的唯一写点：
// GlobalImmersionShell 的 themeMode effect、loadSavedThemeMode、saveThemeMode
// 三路最终都经它把 data-novip-visual-mode 写到 document.documentElement 上。
// 本文件只锁定该写点本身的契约；load/save 的存储侧行为由 #144 覆盖。

type FakeElement = {
  setAttribute: (name: string, value: string) => void;
  calls: Array<[string, string]>;
  attrs: Map<string, string>;
};

function fakeElement(): FakeElement {
  const el: FakeElement = {
    calls: [],
    attrs: new Map<string, string>(),
    setAttribute: (name: string, value: string) => {
      el.calls.push([name, value]);
      el.attrs.set(name, value);
    },
  };
  return el;
}

function memoryStorage(initial: Record<string, string> = {}): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function runWithDocument<T>(doc: unknown, fn: () => T): T {
  const holder = globalThis as {document?: unknown};
  const prev = holder.document;
  holder.document = doc;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete holder.document;
    else holder.document = prev;
  }
}

function runWithoutDocument<T>(fn: () => T): T {
  const holder = globalThis as {document?: unknown};
  const prev = holder.document;
  delete holder.document;
  try {
    return fn();
  } finally {
    if (prev !== undefined) holder.document = prev;
  }
}

function runWithWindow<T>(win: unknown, fn: () => T): T {
  const holder = globalThis as {window?: unknown};
  const prev = holder.window;
  holder.window = win;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete holder.window;
    else holder.window = prev;
  }
}

describe('NOVIP 沉浸式主题模式 DOM 落盘 (capability.ts applyDocumentThemeMode)', () => {
  it('01. immersive 模式写入 data-novip-visual-mode=immersive', () => {
    const el = fakeElement();
    runWithDocument({documentElement: el}, () => {
      applyDocumentThemeMode('immersive');
    });
    assert.deepEqual(el.calls, [['data-novip-visual-mode', 'immersive']]);
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'immersive');
  });

  it('02. daylight 模式写入 data-novip-visual-mode=daylight', () => {
    const el = fakeElement();
    runWithDocument({documentElement: el}, () => {
      applyDocumentThemeMode('daylight');
    });
    assert.deepEqual(el.calls, [['data-novip-visual-mode', 'daylight']]);
  });

  it('03. minimal 模式写入 data-novip-visual-mode=minimal', () => {
    const el = fakeElement();
    runWithDocument({documentElement: el}, () => {
      applyDocumentThemeMode('minimal');
    });
    assert.deepEqual(el.calls, [['data-novip-visual-mode', 'minimal']]);
  });

  it('04. 重复调用以后一次为准，恰好写两次', () => {
    const el = fakeElement();
    runWithDocument({documentElement: el}, () => {
      applyDocumentThemeMode('daylight');
      applyDocumentThemeMode('minimal');
    });
    assert.deepEqual(el.calls, [
      ['data-novip-visual-mode', 'daylight'],
      ['data-novip-visual-mode', 'minimal'],
    ]);
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'minimal');
  });

  it('05. 无 document 环境下不抛错、静默跳过', () => {
    runWithoutDocument(() => {
      assert.doesNotThrow(() => applyDocumentThemeMode('immersive'));
    });
  });

  it('06. document 存在但 documentElement 为 null 时不抛错、不写属性', () => {
    const el = fakeElement();
    runWithDocument({documentElement: null}, () => {
      assert.doesNotThrow(() => applyDocumentThemeMode('immersive'));
    });
    assert.deepEqual(el.calls, []);
  });

  it('07. document 存在但 documentElement 为 undefined 时不抛错', () => {
    runWithDocument({}, () => {
      assert.doesNotThrow(() => applyDocumentThemeMode('daylight'));
    });
  });

  it('08. setAttribute 抛错时原样向上传播（本层不吞错）', () => {
    const throwing = {
      setAttribute: () => {
        throw new Error('dom boom');
      },
    };
    runWithDocument({documentElement: throwing}, () => {
      assert.throws(() => applyDocumentThemeMode('immersive'), /dom boom/);
    });
  });

  it('09. 非法模式串原样透传（本层不校验；白名单校验在调用方）', () => {
    const el = fakeElement();
    runWithDocument({documentElement: el}, () => {
      applyDocumentThemeMode('dark' as unknown as VisualThemeMode);
    });
    assert.deepEqual(el.calls, [['data-novip-visual-mode', 'dark']]);
  });

  it('10. saveThemeMode 保存时同步把属性写到 documentElement', () => {
    const el = fakeElement();
    const storage = memoryStorage();
    runWithDocument({documentElement: el}, () => {
      runWithWindow({localStorage: storage}, () => {
        saveThemeMode('daylight');
      });
    });
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'daylight');
    assert.equal(storage.getItem(IMMERSION_THEME_STORAGE_KEY), 'daylight');
  });

  it('11. loadSavedThemeMode 读到 minimal 时返回 minimal 且属性为 minimal', () => {
    const el = fakeElement();
    const storage = memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'minimal'});
    let ret: VisualThemeMode | undefined;
    runWithDocument({documentElement: el}, () => {
      runWithWindow({localStorage: storage}, () => {
        ret = loadSavedThemeMode();
      });
    });
    assert.equal(ret, 'minimal');
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'minimal');
  });

  it('12. loadSavedThemeMode 存储为空时回落 immersive 且属性为 immersive', () => {
    const el = fakeElement();
    const storage = memoryStorage();
    let ret: VisualThemeMode | undefined;
    runWithDocument({documentElement: el}, () => {
      runWithWindow({localStorage: storage}, () => {
        ret = loadSavedThemeMode();
      });
    });
    assert.equal(ret, 'immersive');
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'immersive');
  });

  it('13. loadSavedThemeMode 读到非法值时回落 immersive 且属性为 immersive', () => {
    const el = fakeElement();
    const storage = memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'dark'});
    let ret: VisualThemeMode | undefined;
    runWithDocument({documentElement: el}, () => {
      runWithWindow({localStorage: storage}, () => {
        ret = loadSavedThemeMode();
      });
    });
    assert.equal(ret, 'immersive');
    assert.equal(el.attrs.get('data-novip-visual-mode'), 'immersive');
  });

  it('14. 无 document 时 save/load 仍走存储路径、不因写属性抛错', () => {
    const storage = memoryStorage();
    runWithoutDocument(() => {
      runWithWindow({localStorage: storage}, () => {
        saveThemeMode('minimal');
        assert.equal(loadSavedThemeMode(), 'minimal');
      });
    });
    assert.equal(storage.getItem(IMMERSION_THEME_STORAGE_KEY), 'minimal');
  });
});
