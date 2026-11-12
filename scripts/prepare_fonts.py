"""Bundle eight OFL faces; preserve notices and extract actual cmap coverage."""
from pathlib import Path
import os, shutil, re, json, hashlib, urllib.request
from fontTools.ttLib import TTFont
from fontTools import subset
root=Path(__file__).resolve().parents[1];out=root/'public/fonts';out.mkdir(exist_ok=True,parents=True)
css=[];coverage={};sizes={};meta={}
for key,package,style in [('wenkai','lxgw-wenkai','500.css'),('longcang','long-cang','400.css'),('mashan','ma-shan-zheng','400.css')]:
 folder=root/'node_modules/@fontsource'/package;source=(folder/style).read_text();source=re.sub(r", url\([^)]*\.woff\) format\('woff'\)",'',source).replace('font-weight: 500','font-weight: 400');chars=set();size=0
 for file in set(re.findall(r'url\(\./files/([^)]*\.woff2)\)',source)):
  shutil.copy2(folder/'files'/file,out/file);f=TTFont(folder/'files'/file);chars.update(f.getBestCmap());f.close();size+=(out/file).stat().st_size
 (out/f'{key}-OFL.txt').write_text((folder/'LICENSE').read_text());coverage[key]=sorted(chars);sizes[key]={'codepoints':len(chars),'woff2_bytes':size};css.append(source.replace('./files/','./'))
for key,package,face in [('yozai','yozai','Yozai-Regular'),('xiaolai','xiaolai','Xiaolai')]:
 folder=root/f'node_modules/@chinese-fonts/{package}/dist/{face}';source=(folder/'result.css').read_text();source=re.sub(r'local\([^)]*\),','',source);chars=set();size=0
 for file in set(re.findall(r'url\([\"\']?\./([^\"\')]+\.woff2)[\"\']?\)',source)):
  dest=f'{key}-{file}';shutil.copy2(folder/file,out/dest);f=TTFont(folder/file);chars.update(f.getBestCmap());f.close();size+=(out/dest).stat().st_size;source=source.replace('./'+file,'./'+dest)
 licence=(out/f'upstream/{key}-OFL.txt').read_text();(out/f'{key}-OFL.txt').write_text(licence);coverage[key]=sorted(chars);sizes[key]={'codepoints':len(chars),'woff2_bytes':size};css.append(source)
font_source=Path(os.environ.get('FONT_SOURCE_DIR',root.parent/'font-sources'));font_source.mkdir(exist_ok=True,parents=True)
for key,file in [('jason1','JasonHandwriting1.ttf'),('jason2','JasonHandwriting2.ttf'),('jason8','JasonHandwriting8p.ttf')]:
 p=font_source/file;url='https://raw.githubusercontent.com/jasonhandwriting/JasonHandwriting/master/'+file
 if not p.exists():urllib.request.urlretrieve(url,p)
 f=TTFont(p);family=f['name'].getDebugName(1);copyright=f['name'].getDebugName(0);coverage[key]=sorted(f.getBestCmap());f.flavor='woff2';dest=f'{key}-v2.woff2';f.save(out/dest);f.close();sizes[key]={'codepoints':len(coverage[key]),'woff2_bytes':(out/dest).stat().st_size};meta[key]={'source':url,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'family':family,'copyright':copyright}
 # Author's embedded declaration and published README specify SIL OFL; include its full standard text.
 standard=(out/'wenkai-OFL.txt').read_text();standard=standard[standard.index('This Font Software'):];(out/f'{key}-OFL.txt').write_text(copyright+'\nOriginal source: https://github.com/jasonhandwriting/JasonHandwriting\n\n'+standard)
 css.append(f'@font-face{{font-family:"{family}";font-weight:400;font-style:normal;font-display:swap;src:url(./{dest}) format("woff2");}}')
# Tiny, explicitly renamed OFL UI derivative avoids loading the 7 MB document font for interface labels.
ui=TTFont(root/'node_modules/@fontsource/lxgw-wenkai/files/lxgw-wenkai-latin-500-normal.woff2')
ui_chars=set()
for p in list((root/'src').glob('*'))+list((root/'tests').glob('*.mjs')):
 if p.is_file():ui_chars.update(map(ord,p.read_text()))
opt=subset.Options();sub=subset.Subsetter(options=opt);sub.populate(unicodes=ui_chars);sub.subset(ui)
for record in ui['name'].names:
 if record.nameID in [1,3,4,6,16,17]:
  value='Regular' if record.nameID==17 else 'PaperPenUI-Regular' if record.nameID in [3,6] else 'PaperPen UI'
  record.string=value.encode(record.getEncoding())
ui.flavor='woff2';ui.save(out/'paperpen-ui-v2.woff2');ui.close();css.insert(0,'@font-face{font-family:"PaperPen UI";font-weight:100 900;font-style:normal;font-display:swap;src:url(./paperpen-ui-v2.woff2) format("woff2");}')
(out/'ui-OFL.txt').write_text((out/'wenkai-OFL.txt').read_text()+'\nPaperPen UI is a renamed subset derivative made solely for this application interface.\n')
(out/'fonts-v2.css').write_text('\n'.join(css));(out/'coverage-v2.json').write_text(json.dumps(coverage,separators=(',',':')));(out/'sources-v2.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));(out/'stats-v2.json').write_text(json.dumps(sizes,indent=2))
(out/'NOTICE.txt').write_text('All bundled document fonts are licensed under SIL Open Font License 1.1. The npm package metadata license does not replace the original font license.\n\n'+ '\n'.join([f'{k}: {v["codepoints"]} Unicode codepoints; see {k}-OFL.txt.' for k,v in sizes.items()])+'\n\nLXGW WenKai: https://github.com/lxgw/LxgwWenKai\nYozai: https://github.com/lxgw/yozai-font\nXiaolai: https://github.com/lxgw/kose-font\nJasonHandwriting 1/2/8p, by Yu Ching Sung: https://github.com/jasonhandwriting/JasonHandwriting\nLong Cang: https://github.com/googlefonts/longcang\nMa Shan Zheng: https://github.com/googlefonts/mashanzheng\n\nDocument font outlines are unmodified. Jason faces are original author binaries converted to WOFF2. Yozai/Xiaolai use existing web subsets, not newly drawn or merged glyphs. PaperPen UI is a separately renamed OFL subset derivative; see ui-OFL.txt. Font binaries retain embedded copyright, and Jason source hashes are in sources-v2.json.\nNo competitor code or assets are used.\n')
print(json.dumps(sizes,indent=2))
