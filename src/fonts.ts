import {selectPersonal,type PersonalFont} from './local-fonts';
import {fontNames,type FontId} from './engine';
import {ensureHandwritingStyles} from './font-styles';

type Coverage = Record<FontId, number[]>;
let coverage: Record<FontId, Set<number>>;

export async function prepareFonts(font: FontId, text: string, personalFonts: PersonalFont[] = [], seed = 0) {
  await ensureHandwritingStyles();
  if (!coverage) {
    const r = await fetch(`${import.meta.env.BASE_URL}fonts/coverage-v3.json`);
    if (!r.ok) throw new Error('字库数据加载失败，请重新连接网络后重试。');
    const data = (await r.json()) as Coverage;
    coverage = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, new Set(v)])) as Record<FontId, Set<number>>;
  }

  const fallback: string[] = [],
    missing: string[] = [],
    loads = new Map<string, string[]>();

  // Style-aware natural fallback hierarchy to avoid sudden printed Kaiti fallback
  const isCursive = ['zhimang', 'longcang', 'liujian', 'mashan'].includes(font);
  const fallbackOrder: FontId[] = isCursive
    ? ['zhimang', 'longcang', 'liujian', 'chill', 'klee', 'yozai', 'kuaile', 'wenkai']
    : ['chill', 'klee', 'yozai', 'xiaolai', 'kuaile', 'jason1', 'jason2', 'jason8', 'zhimang', 'longcang', 'wenkai'];

  const fallbackChain: FontId[] = [...(font === 'custom' ? [] : [font]), ...fallbackOrder.filter(x => x !== font)];

  function fontFor(char: string, index = 0) {
    if (font === 'custom') {
      const personal = selectPersonal(personalFonts, char, index, seed);
      if (personal) return personal.family;
    }
    const cp = char.codePointAt(0)!;
    for (const id of fallbackChain) {
      if (coverage[id]?.has(cp)) return fontNames[id];
    }
    return 'sans-serif';
  }

  for (const char of new Set(Array.from(text))) {
    if (/\s/u.test(char)) continue;
    const family = fontFor(char);
    if (family === 'sans-serif') {
      missing.push(char);
      continue;
    }
    if (font === 'custom' ? !personalFonts.some(f => f.family === family) : family !== fontNames[font]) {
      fallback.push(char);
    }
    if (!loads.has(family)) loads.set(family, []);
    loads.get(family)!.push(char);
  }

  await Promise.all(Array.from(loads, ([family, chars]) => document.fonts.load(`24px "${family}"`, chars.join(''))));
  for (const [family, chars] of loads) {
    if (!document.fonts.check(`24px "${family}"`, chars.join(''))) {
      throw new Error('手写字体尚未加载完成，请稍后重试。');
    }
  }

  return { fallback, missing, fontFor };
}
