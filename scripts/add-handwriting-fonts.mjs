import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_FONTS = path.join(ROOT, 'public/fonts');
const DIST_FONTS = path.join(ROOT, 'dist/fonts');

fs.mkdirSync(PUBLIC_FONTS, { recursive: true });

function parseUnicodeRanges(rangeStr) {
  const points = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim().replace(/^U\+/i, '');
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startHex, endHex] = trimmed.split('-');
      const start = parseInt(startHex, 16);
      const end = parseInt(endHex, 16);
      for (let cp = start; cp <= end; cp++) {
        points.add(cp);
      }
    } else {
      points.add(parseInt(trimmed, 16));
    }
  }
  return points;
}

const fontConfigs = [
  { key: 'zhimang', pkg: 'zhi-mang-xing', family: 'Zhi Mang Xing' },
  { key: 'liujian', pkg: 'liu-jian-mao-cao', family: 'Liu Jian Mao Cao' },
  { key: 'kuaile', pkg: 'zcool-kuaile', family: 'ZCOOL KuaiLe' },
  { key: 'klee', pkg: 'klee-one', family: 'Klee One' }
];

const BASELINE_METADATA_DIR = path.join(ROOT, 'src/assets/font-metadata');

// 1. Read existing coverage-v3.json (priority: public/fonts -> src/assets/font-metadata -> remote fallback)
const coveragePath = path.join(PUBLIC_FONTS, 'coverage-v3.json');
const baselineCoveragePath = path.join(BASELINE_METADATA_DIR, 'coverage-v3.json');
let coverage = {};
if (fs.existsSync(coveragePath)) {
  try {
    coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
  } catch (e) {
    console.warn('Could not parse local coverage-v3.json:', e);
  }
} else if (fs.existsSync(baselineCoveragePath)) {
  try {
    console.log('Loading committed baseline from src/assets/font-metadata/coverage-v3.json ...');
    coverage = JSON.parse(fs.readFileSync(baselineCoveragePath, 'utf-8'));
  } catch (e) {
    console.warn('Could not parse baseline coverage-v3.json:', e);
  }
} else {
  try {
    console.log('Fetching baseline coverage-v3.json from https://novip.site/fonts/coverage-v3.json ...');
    const res = await fetch('https://novip.site/fonts/coverage-v3.json', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      coverage = await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch remote coverage-v3.json (falling back to empty base):', err.message);
  }
}

// 2. Read existing fonts-v4.css (priority: public/fonts -> src/assets/font-metadata -> remote fallback)
const cssPath = path.join(PUBLIC_FONTS, 'fonts-v4.css');
const baselineCssPath = path.join(BASELINE_METADATA_DIR, 'fonts-v4.css');
let cssContent = '';
if (fs.existsSync(cssPath)) {
  try {
    cssContent = fs.readFileSync(cssPath, 'utf-8');
  } catch (e) {
    console.warn('Could not parse local fonts-v4.css:', e);
  }
} else if (fs.existsSync(baselineCssPath)) {
  try {
    console.log('Loading committed baseline from src/assets/font-metadata/fonts-v4.css ...');
    cssContent = fs.readFileSync(baselineCssPath, 'utf-8');
  } catch (e) {
    console.warn('Could not parse baseline fonts-v4.css:', e);
  }
} else {
  try {
    console.log('Fetching baseline fonts-v4.css from https://novip.site/fonts/fonts-v4.css ...');
    const res = await fetch('https://novip.site/fonts/fonts-v4.css', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      cssContent = await res.text();
    }
  } catch (err) {
    console.warn('Could not fetch remote fonts-v4.css (falling back to empty base):', err.message);
  }
}

console.log('Processing new handwriting fonts...');

for (const f of fontConfigs) {
  const pkgDir = path.join(ROOT, 'node_modules/@fontsource', f.pkg);
  if (!fs.existsSync(pkgDir)) {
    console.warn(`Font package not found: ${pkgDir}`);
    continue;
  }
  const filesDir = path.join(pkgDir, 'files');
  const cssFile = path.join(pkgDir, '400.css');
  const unicodeFile = path.join(pkgDir, 'unicode.json');
  const licenseFile = path.join(pkgDir, 'LICENSE');

  // Copy woff2 files
  if (fs.existsSync(filesDir)) {
    const woff2Files = fs.readdirSync(filesDir).filter(x => x.endsWith('.woff2'));
    console.log(`Copying ${woff2Files.length} woff2 files for ${f.key} (${f.family})...`);
    for (const file of woff2Files) {
      fs.copyFileSync(path.join(filesDir, file), path.join(PUBLIC_FONTS, file));
      if (fs.existsSync(DIST_FONTS)) {
        fs.copyFileSync(path.join(filesDir, file), path.join(DIST_FONTS, file));
      }
    }
  }

  // Copy License
  if (fs.existsSync(licenseFile)) {
    fs.copyFileSync(licenseFile, path.join(PUBLIC_FONTS, `${f.key}-OFL.txt`));
  }

  // Parse unicode coverage
  if (fs.existsSync(unicodeFile)) {
    const unicodeData = JSON.parse(fs.readFileSync(unicodeFile, 'utf-8'));
    const allPoints = new Set();
    for (const val of Object.values(unicodeData)) {
      const pts = parseUnicodeRanges(val);
      for (const p of pts) allPoints.add(p);
    }
    coverage[f.key] = Array.from(allPoints).sort((a, b) => a - b);
    console.log(`  -> ${f.key} has ${coverage[f.key].length} codepoints.`);
  }

  // Clean and append @font-face rules
  if (fs.existsSync(cssFile)) {
    let sourceCss = fs.readFileSync(cssFile, 'utf-8');
    sourceCss = sourceCss.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
    sourceCss = sourceCss.replace(/\.\/files\//g, './');
    
    if (!cssContent.includes(`font-family: '${f.family}'`) && !cssContent.includes(`font-family:"${f.family}"`)) {
      cssContent += '\n\n/* ' + f.family + ' */\n' + sourceCss;
    }
  }
}

// Ensure @chinese-fonts (xiaolai & yozai) woff2 files are present in public/fonts & dist/fonts
const chineseFonts = [
  { prefix: 'xiaolai-', dir: path.join(ROOT, 'node_modules/@chinese-fonts/xiaolai/dist/Xiaolai') },
  { prefix: 'yozai-', dir: path.join(ROOT, 'node_modules/@chinese-fonts/yozai/dist/Yozai-Regular') }
];
for (const cf of chineseFonts) {
  if (fs.existsSync(cf.dir)) {
    const woff2Files = fs.readdirSync(cf.dir).filter(x => x.endsWith('.woff2'));
    for (const file of woff2Files) {
      const destName = `${cf.prefix}${file}`;
      const pubPath = path.join(PUBLIC_FONTS, destName);
      if (!fs.existsSync(pubPath)) {
        fs.copyFileSync(path.join(cf.dir, file), pubPath);
      }
      if (fs.existsSync(DIST_FONTS)) {
        const distPath = path.join(DIST_FONTS, destName);
        if (!fs.existsSync(distPath)) {
          fs.copyFileSync(path.join(cf.dir, file), distPath);
        }
      }
    }
  }
}

// Write updated coverage-v3.json
fs.writeFileSync(coveragePath, JSON.stringify(coverage));
if (fs.existsSync(DIST_FONTS)) {
  fs.writeFileSync(path.join(DIST_FONTS, 'coverage-v3.json'), JSON.stringify(coverage));
}
console.log('Saved updated coverage-v3.json with keys:', Object.keys(coverage));

// Write updated fonts-v4.css
fs.writeFileSync(cssPath, cssContent);
if (fs.existsSync(DIST_FONTS)) {
  fs.writeFileSync(path.join(DIST_FONTS, 'fonts-v4.css'), cssContent);
}
console.log('Saved updated fonts-v4.css');

console.log('All new handwriting fonts installed successfully!');
