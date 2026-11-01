import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('manual live Firebase probe stays parseable and includes both G6/G7 sessions',()=>{
 const target=path.join(root,'tests/v2-g6-live-firebase.browser.mjs');
 const content=readFileSync(target,'utf8');
 execFileSync(process.execPath,['--check',target],{cwd:root,stdio:'pipe'});
 assert.match(content,/G6_LIVE_TWO_BROWSER_SUCCESS/);
 assert.match(content,/selectOption\('recovery'\)/);
 assert.match(content,/G7_LIVE_RECOVERY_SUCCESS/);
 assert.match(content,/g7A\.players\[1\]\.hand!==undefined\|\|g7B\.players\[0\]\.hand!==undefined/);
 const workflow=readFileSync(path.join(root,'.github/workflows/g6-live-firebase-probe.yml'),'utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^\s+pull_request:/m);
 assert.doesNotMatch(workflow,/^\s+push:/m);
});
