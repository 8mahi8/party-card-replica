import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const page=readFileSync(resolve(root,'v2/demo/firebase-online-lab.html'),'utf8');
test('new online page inline ESM parses under Node without importing Firebase',()=>{
 const match=page.match(/<script type="module">([\s\S]*?)<\/script>/);
 assert(match,'Must contain an ESM entrypoint');
 const out=spawnSync(process.execPath,['--input-type=module','--check'],{
  input:match[1],encoding:'utf8'});
 assert.equal(out.status,0,out.stderr||'Could not parse inline ESM');
});
test('online page explicitly uses the isolated Firebase transport and working school compat SDK',()=>{
 assert.match(page,/firebase-app-compat\.js/);
 assert.match(page,/firebase-database-compat\.js/);
 assert.match(page,/firebase-two-seat-transport-fixture\.mjs/);
 assert.match(page,/mygame-df915-default-rtdb\.firebaseio\.com/);
 assert.match(page,/createFirebaseTwoSeatHostFixture/);
 assert.match(page,/joinFirebaseTwoSeatGuestFixture/);
 assert.match(page,/sessionStorage/);
 assert.doesNotMatch(page,/signInAnonymously/);
});
test('school-sized touch controls and safe per-seat rendering are present',()=>{
 for(const id of ['create','join','status','scores','hand','attack','defend','pray','discard']){
  assert(page.includes('id="'+id+'"'),'missing control '+id);
 }
 assert.match(page,/min-height:42px/);
 assert.match(page,/player\.hand\|\|\[\]/);
 assert.match(page,/view\.activePlayerId===seat/);
 assert.match(page,/固定補充/);
 assert.match(page,/ホスト側のタブを閉じると試合が停止/);
});
