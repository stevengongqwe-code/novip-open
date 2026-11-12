"""Add original-author ChillZhuo and ChenYuluoyan binaries to the v2 bundle.
Run prepare_fonts.py first for a clean rebuild; this script preserves those faces.
"""
from pathlib import Path
import json,shutil,hashlib,urllib.request,zipfile
from fontTools.ttLib import TTFont
from fontTools import subset
root=Path(__file__).resolve().parents[1];out=root/'public/fonts';source=root.parent/'font-sources';source.mkdir(exist_ok=True)
urls={
 'ChillZhuo.v2.400.zip':'https://raw.githubusercontent.com/Warren2060/ChillShouZhuo/main/ChillZhuo.v2.400.zip',
 'ChillZhuo-README.md':'https://raw.githubusercontent.com/Warren2060/ChillShouZhuo/main/README.md',
 'ChenYuluoyan-2.0-Thin.ttf':'https://raw.githubusercontent.com/Chenyu-otf/chenyuluoyan_thin/main/ChenYuluoyan-2.0-Thin.ttf',
 'chenyu-license.txt':'https://raw.githubusercontent.com/Chenyu-otf/chenyuluoyan_thin/main/license.txt'}
for name,url in urls.items():
 if not (source/name).exists():urllib.request.urlretrieve(url,source/name)
with zipfile.ZipFile(source/'ChillZhuo.v2.400.zip') as z:z.extractall(source/'chill')
coverage=json.loads((out/'coverage-v2.json').read_text());stats=json.loads((out/'stats-v2.json').read_text());meta=json.loads((out/'sources-v2.json').read_text());css=(out/'fonts-v2.css').read_text()
for key,p,family in [('chill',source/'chill/ChillZhuo.v2.400/ChillZhuo.woff2','ChillZhuo'),('chenyu',source/'ChenYuluoyan-2.0-Thin.ttf','ChenYuluoyan')]:
 f=TTFont(p);coverage[key]=sorted(f.getBestCmap());copyright=f['name'].getDebugName(0);dest=out/f'{key}-v3.woff2'
 if key=='chill':shutil.copy2(p,dest)
 else:f.flavor='woff2';f.save(dest)
 meta[key]={'source':urls['ChillZhuo.v2.400.zip' if key=='chill' else p.name],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'family':f['name'].getDebugName(1),'copyright':copyright};f.close()
 stats[key]={'codepoints':len(coverage[key]),'woff2_bytes':dest.stat().st_size}
 css+=f'\n@font-face{{font-family:"{family}";font-style:normal;font-weight:400;font-display:swap;src:url(./{dest.name}) format("woff2");}}'
(out/'chill-AUTHOR-LICENSE.txt').write_text('ChillZhuo by 寒蝉字型 / ChillType\nOriginal source: https://github.com/Warren2060/ChillShouZhuo\n\n'+(source/'ChillZhuo-README.md').read_text())
shutil.copy2(source/'chenyu-license.txt',out/'chenyu-OFL.txt')
# Renew separately renamed UI subset for new labels, retain copyright/licence.
ui=TTFont(root/'node_modules/@fontsource/lxgw-wenkai/files/lxgw-wenkai-latin-500-normal.woff2');chars=set()
for p in list((root/'src').glob('*'))+list((root/'tests').glob('*.mjs')):
 if p.is_file():chars.update(map(ord,p.read_text()))
sub=subset.Subsetter(options=subset.Options());sub.populate(unicodes=chars);sub.subset(ui)
for r in ui['name'].names:
 if r.nameID in [1,3,4,6,16,17]:r.string=('Regular' if r.nameID==17 else 'PaperPenUI-Regular' if r.nameID in [3,6] else 'PaperPen UI').encode(r.getEncoding())
ui.flavor='woff2';ui.save(out/'paperpen-ui-v3.woff2');ui.close();css=css.replace('paperpen-ui-v2.woff2','paperpen-ui-v3.woff2')
for name,data in [('coverage-v3.json',coverage),('stats-v3.json',stats),('sources-v3.json',meta)]: (out/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
(out/'fonts-v3.css').write_text(css)
notice=(out/'NOTICE.txt').read_text().replace('All bundled document fonts are licensed under SIL Open Font License 1.1.','Nine bundled document fonts are licensed under SIL Open Font License 1.1. ChillZhuo is released under its author\'s free-use declaration, including commercial use, with attribution to 寒蝉字型 / ChillType. See chill-AUTHOR-LICENSE.txt.')
notice+='\nChillZhuo (寒蝉手拙体): '+meta['chill']['source']+'\nChenYuluoyan (辰宇落雁體), Wang, Li-Yu & Liu, Wei-Chen: https://github.com/Chenyu-otf/chenyuluoyan_thin\nSee sources-v3.json for source hashes. ChillZhuo uses the author\'s unmodified WOFF2. ChenYuluoyan original outlines are unchanged, container converted to WOFF2.\n'
# Ensure repeated script execution does not duplicate appended notice.
notice=notice.split('\nChillZhuo (寒蝉手拙体):')[0]+'\n'+notice[notice.rfind('ChillZhuo (寒蝉手拙体):'):]
(out/'NOTICE.txt').write_text(notice)
print(json.dumps({k:stats[k] for k in ['chill','chenyu']},indent=2))
