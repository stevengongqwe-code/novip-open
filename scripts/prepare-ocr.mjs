import {mkdirSync,copyFileSync,readdirSync} from 'node:fs';
mkdirSync('public/ocr/lang',{recursive:true});copyFileSync('node_modules/tesseract.js-core/LICENSE','public/ocr/Core-LICENSE.txt');copyFileSync('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');copyFileSync('node_modules/tesseract.js/LICENSE.md','public/ocr/Tesseract-LICENSE.txt');
for(const file of readdirSync('node_modules/tesseract.js-core'))if(/^tesseract-core.*\.(wasm|js)$/.test(file))copyFileSync('node_modules/tesseract.js-core/'+file,'public/ocr/'+file);
for(const lang of ['eng','chi_sim'])copyFileSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`public/ocr/lang/${lang}.traineddata.gz`);
