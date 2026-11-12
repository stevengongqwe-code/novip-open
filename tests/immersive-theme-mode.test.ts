import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  IMMERSION_THEME_STORAGE_KEY,
  loadSavedThemeMode,
  probeWebGLSupport,
  saveThemeMode,
  resolveEffectiveTier,
} from '../src/immersive/capability.ts';
import type {ImmersionCapabilityProfile} from '../src/immersive/capability.ts';

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  entries: () => Array<[string, string]>;
};

function memoryStorage(initial: Record<string, string> = {}): MemoryStore {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    entries: () => [...store.entries()],
  };
}

function runWithWindow(localStorage: unknown, fn: () => void): void {
  const holder = globalThis as {window?: unknown};
  const prev = holder.window;
  holder.window = {localStorage};
  try {
    fn();
  } finally {
    if (prev === undefined) delete holder.window;
    else holder.window = prev;
  }
}

function runWithoutWindow(fn: () => void): void {
  const holder = globalThis as {window?: unknown};
  const prev = holder.window;
  delete holder.window;
  try {
    fn();
  } finally {
    if (prev !== undefined) holder.window = prev;
  }
}

describe('NOVIP 沉浸式主题模式持久化 (capability.ts load/saveThemeMode + probeWebGLSupport)', () => {
  it('01. 主题存储键字面值为 novip-immersion-theme-v1', () => {
    assert.equal(IMMERSION_THEME_STORAGE_KEY, 'novip-immersion-theme-v1');
  });

  it('02. 无 window 环境下读取返回默认 immersive', () => {
    runWithoutWindow(() => {
      assert.equal(loadSavedThemeMode(), 'immersive');
    });
  });

  it('03. 存储为空时读取返回默认 immersive', () => {
    runWithWindow(memoryStorage(), () => {
      assert.equal(loadSavedThemeMode(), 'immersive');
    });
  });

  it('04. 存 daylight 时读取原样返回 daylight', () => {
    runWithWindow(memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'daylight'}), () => {
      assert.equal(loadSavedThemeMode(), 'daylight');
    });
  });

  it('05. 存 minimal 时读取原样返回 minimal', () => {
    runWithWindow(memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'minimal'}), () => {
      assert.equal(loadSavedThemeMode(), 'minimal');
    });
  });

  it('06. 存 immersive 时读取原样返回 immersive', () => {
    runWithWindow(memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'immersive'}), () => {
      assert.equal(loadSavedThemeMode(), 'immersive');
    });
  });

  it('07. 存未知值 dark 时回落默认 immersive', () => {
    runWithWindow(memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'dark'}), () => {
      assert.equal(loadSavedThemeMode(), 'immersive');
    });
  });

  it('08. 空串/大小写/首尾空格/字面 null 均回落默认 immersive', () => {
    for (const bad of ['', 'IMMERSIVE', ' daylight', 'null', 'Daylight']) {
      runWithWindow(memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: bad}), () => {
        assert.equal(loadSavedThemeMode(), 'immersive');
      });
    }
  });

  it('09. localStorage 读取抛错时返回默认 immersive 且不抛错', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    runWithWindow(throwing, () => {
      assert.equal(loadSavedThemeMode(), 'immersive');
    });
  });

  it('10. 保存时按存储键原样写入对应值', () => {
    const storage = memoryStorage();
    runWithWindow(storage, () => {
      saveThemeMode('daylight');
    });
    assert.deepEqual(storage.entries(), [[IMMERSION_THEME_STORAGE_KEY, 'daylight']]);
  });

  it('11. 保存会覆盖同一键的旧值', () => {
    const storage = memoryStorage({[IMMERSION_THEME_STORAGE_KEY]: 'daylight'});
    runWithWindow(storage, () => {
      saveThemeMode('minimal');
    });
    assert.deepEqual(storage.entries(), [[IMMERSION_THEME_STORAGE_KEY, 'minimal']]);
  });

  it('12. 保存后读取往返三种模式均一致', () => {
    const storage = memoryStorage();
    runWithWindow(storage, () => {
      for (const mode of ['daylight', 'minimal', 'immersive'] as const) {
        saveThemeMode(mode);
        assert.equal(loadSavedThemeMode(), mode);
      }
    });
  });

  it('13. localStorage 写入抛错时保存不抛错', () => {
    const throwing = {
      setItem: () => {
        throw new Error('denied');
      },
    };
    runWithWindow(throwing, () => {
      assert.doesNotThrow(() => saveThemeMode('daylight'));
    });
  });

  it('14. 无 window 环境下保存为 no-op 且不抛错', () => {
    runWithoutWindow(() => {
      assert.doesNotThrow(() => saveThemeMode('daylight'));
    });
  });

  it('15. node 环境（无 document）下 WebGL 探测返回全否且 renderer 为 none', () => {
    assert.deepEqual(probeWebGLSupport(), {webgl: false, webgl2: false, renderer: 'none'});
  });

  it('16. resolveEffectiveTier 在 minimal 模式下恒定返回 minimal', () => {
    const dummyCap: ImmersionCapabilityProfile = {
      tier: 'high',
      reason: 'test',
      isWeChat: false,
      isMobile: false,
      isLowEndAndroid: false,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: true,
      maxDpr: 2,
      particleCount: 300,
      targetFps: 60,
      enableShaderNebula: true,
      enableCardTilt: true,
      enablePointerFluid: true,
    };
    assert.equal(resolveEffectiveTier('minimal', dummyCap), 'minimal');
  });

  it('17. resolveEffectiveTier 在安卓低电量省电模式下（tier 为 minimal 但支持 WebGL）回落 lite 流畅档位', () => {
    const batterySaverAndroidCap: ImmersionCapabilityProfile = {
      tier: 'minimal',
      reason: 'prefers-reduced-motion',
      isWeChat: false,
      isMobile: true,
      isLowEndAndroid: false,
      prefersReducedMotion: true,
      webglSupported: true,
      webgl2Supported: false,
      maxDpr: 1,
      particleCount: 0,
      targetFps: 0,
      enableShaderNebula: false,
      enableCardTilt: false,
      enablePointerFluid: false,
    };
    assert.equal(resolveEffectiveTier('immersive', batterySaverAndroidCap), 'lite');
  });

  it('18. resolveEffectiveTier 在 WebGL 完全不可用时保持 minimal 安全档位', () => {
    const noWebglCap: ImmersionCapabilityProfile = {
      tier: 'minimal',
      reason: 'webgl-unavailable',
      isWeChat: false,
      isMobile: false,
      isLowEndAndroid: false,
      prefersReducedMotion: false,
      webglSupported: false,
      webgl2Supported: false,
      maxDpr: 1,
      particleCount: 28,
      targetFps: 30,
      enableShaderNebula: false,
      enableCardTilt: false,
      enablePointerFluid: false,
    };
    assert.equal(resolveEffectiveTier('immersive', noWebglCap), 'minimal');
  });

  it('19. resolveEffectiveTier 在常规高配环境下原样透传 high 档位', () => {
    const highCap: ImmersionCapabilityProfile = {
      tier: 'high',
      reason: 'desktop-high-webgl2',
      isWeChat: false,
      isMobile: false,
      isLowEndAndroid: false,
      prefersReducedMotion: false,
      webglSupported: true,
      webgl2Supported: true,
      maxDpr: 1.5,
      particleCount: 320,
      targetFps: 60,
      enableShaderNebula: true,
      enableCardTilt: true,
      enablePointerFluid: true,
    };
    assert.equal(resolveEffectiveTier('immersive', highCap), 'high');
  });
});
