import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dest=path.join(root,'demo','standalone.html');

test('standalone demo rebuild is byte-for-byte reproducible',()=>{
 const before=fs.readFileSync(dest,'utf8');
 execFileSync(process.execPath,[path.join(root,'demo','build.mjs')],{cwd:root});
 const after=fs.readFileSync(dest,'utf8');
 assert.equal(after,before,'Commit regenerated demo/standalone.html whenever modules/template change');
});
test('standalone demo contains one parseable inline script and no external resources',()=>{
 const html=fs.readFileSync(dest,'utf8');
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.ok(!html.includes('/*__ENGINE__*/'));
 assert.ok(!/<script[^>]+src=/i.test(html));
 assert.ok(!/<link[^>]+href=/i.test(html));
 new vm.Script(scripts[0][1]);
});
