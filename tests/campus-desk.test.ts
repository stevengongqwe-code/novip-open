import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import CampusDesk from '../src/tools/CampusDesk';
import {PUBLIC_TOOL_COUNT, SYSTEM_TOOL_IDS, tools} from '../src/tools/registry';

test('campus desk: directory includes every public tool exactly once; shortcuts are real routes', () => {
  const html=renderToStaticMarkup(createElement(CampusDesk,{navigate:()=>{},openClassic:()=>{}}));
  const doc=new JSDOM(html).window.document;
  const links=[...doc.querySelectorAll('.desk-list a')].map(a=>a.getAttribute('href'));
  assert.equal(links.length,PUBLIC_TOOL_COUNT);
  const publicPaths=tools.filter(t=>!SYSTEM_TOOL_IDS.some(id=>id===t.id)).map(t=>t.path);
  assert.deepEqual(new Set(links),new Set(publicPaths));
  assert.equal(doc.querySelectorAll('main h1').length,1);
  const picks=doc.querySelectorAll('.desk-pick');
  assert.equal(picks.length,3);
  for(const a of picks) assert.ok(links.includes(a.getAttribute('href')));
});
