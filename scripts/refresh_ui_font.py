"""Rebuild only the renamed OFL UI subset; leave document outlines and licences unchanged."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
root=Path(__file__).resolve().parents[1];out=root/'public/fonts'
font=TTFont(root/'node_modules/@fontsource/lxgw-wenkai/files/lxgw-wenkai-latin-500-normal.woff2')
chars=set()
for p in list((root/'src').glob('*'))+list((root/'tests').glob('*.mjs')):
 if p.is_file():chars.update(map(ord,p.read_text()))
sub=subset.Subsetter(options=subset.Options());sub.populate(unicodes=chars);sub.subset(font)
for r in font['name'].names:
 if r.nameID in [1,3,4,6,16,17]:r.string=('Regular' if r.nameID==17 else 'PaperPenUI-Regular' if r.nameID in [3,6] else 'PaperPen UI').encode(r.getEncoding())
font.flavor='woff2';font.save(out/'paperpen-ui-v4.woff2');font.close()
(out/'fonts-v4.css').write_text((out/'fonts-v3.css').read_text().replace('paperpen-ui-v3.woff2','paperpen-ui-v4.woff2'))
print('UI font', (out/'paperpen-ui-v4.woff2').stat().st_size,'bytes')
