// Additional reviewable single-file demo; production stays React + TypeScript + Vite.
import {build} from 'esbuild';import fs from 'node:fs';import path from 'node:path';
const coverage=fs.readFileSync('public/fonts/coverage-v2.json','utf8');
const notice=['public/fonts/NOTICE.txt','public/fonts/wenkai-OFL.txt','public/fonts/longcang-OFL.txt','public/fonts/mashan-OFL.txt'].map(f=>fs.readFileSync(f,'utf8')).join('\n\n');
const bundled=await build({entryPoints:['src/main.tsx'],bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',outfile:'offline.js',write:false,define:{'import.meta.env.BASE_URL':'"./"','process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-data',setup(b){b.onLoad({filter:/src\/fonts\.ts$/},async args=>({contents:fs.readFileSync(args.path,'utf8').replace('await fetch(`${import.meta.env.BASE_URL}fonts/coverage-v2.json`)',`new Response(${JSON.stringify(coverage)})`),loader:'ts'}));b.onLoad({filter:/src\/App\.tsx$/},async args=>({contents:fs.readFileSync(args.path,'utf8').replace('${import.meta.env.BASE_URL}fonts/NOTICE.txt',`data:text/plain;base64,${Buffer.from(notice).toString('base64')}`),loader:'tsx'}));}}]});
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css=bundled.outputFiles.find(f=>f.path.endsWith('.css')).text;
const fontCss=fs.readFileSync('public/fonts/fonts-v2.css','utf8').replace(/url\(\.\/([^)]*)\)/g,(_,f)=>`url(data:font/woff2;base64,${fs.readFileSync(path.join('public/fonts',f)).toString('base64')})`);
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>纸间 · 本地试用版（未上线）</title><style>${fontCss}\n${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
fs.writeFileSync('../zhijian-preview.html',html);console.log('Offline demo bytes:',Buffer.byteLength(html));
