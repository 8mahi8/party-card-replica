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
 for(const id of ['create','join','status','scores','hand','attack','sell','defend','pray','discard']){
  assert(page.includes('id="'+id+'"'),'missing control '+id);
 }
 assert.match(page,/min-height:42px/);
 assert.match(page,/player\.hand\|\|\[\]/);
 assert.match(page,/view\.activePlayerId===seat/);
 assert.match(page,/固定補充/);
 assert.match(page,/ホスト側のタブを閉じると試合が停止/);
});

test('online UI preserves in-flight command ID and offers recovery from a lost ack',()=>{
 assert.match(page,/id="retryPanel"/);
 assert.match(page,/id="retry"/);
 assert.match(page,/pendingCommand=command/);
 assert.match(page,/await session\.submit\(pendingCommand\)/);
 assert.match(page,/if\(!ack\|\|ack\.id!==pendingId\)return/);
 assert.match(page,/waiting=false;pendingId=null;pendingCommand=null/);
 assert.doesNotMatch(page,/catch\(error\)\{waiting=false;pendingId=null/);
});

test('reference-style layout keeps the original field, player stats and bottom artifact strip',()=>{
 assert.match(page,/class="brandline"/);
 assert.match(page,/class="battle-board"/);
 assert.match(page,/class="arena"/);
 assert.match(page,/id="selectionPreview"/);
 assert.match(page,/id="handCount"/);
 assert.match(page,/id="battleHint"/);
 assert.match(page,/\.hand\{display:flex/);
 assert.match(page,/overflow-x:auto/);
 assert.match(page,/aria-pressed/);
 assert.match(page,/許す（防御なし）/);
 assert.match(page,/\.score \.statline/);
 assert.match(page,/radial-gradient/);
});

test('selection panel shows ordered artifact confirmation and source-target context',()=>{
 assert.match(page,/id="combatRoute"/);
 assert.match(page,/id="selectionTotal"/);
 assert.match(page,/for\(const entry of selection\)/);
 assert.match(page,/learnedDefinitionId:id\.slice\(2\)/);
 assert.match(page,/カード記載値の合計（参考）/);
 assert.match(page,/\['attack','useItem'\]\.includes\(view\.pending\?\.type\)/);
 assert.match(page,/id="itemTarget"/);
 assert.match(page,/itemDefense/);
 assert.match(page,/document\.createTextNode/);
});

test('defense UI shows only public declared attack projection from the host',()=>{
 assert.match(page,/id="incomingAttack"/);
 assert.match(page,/view\.pending\?\.declaredAttack/);
 assert.match(page,/announced\.printedAttackTotal/);
 assert.match(page,/相手の攻撃：/);
 assert.match(page,/\('incomingAttack'\)\.hidden=!announced/);
});

test('item defense response sends only mirror selection, not weapon-defense arrays',()=>{
 assert.match(page,/effectiveType=type==='defend'&&view\.phase==='itemDefense'\?'respondItem':/);
 assert.match(page,/view\.phase==='tradeDefense'\?'respondSale':type/);
 assert.match(page,/\['playCards','defend','discard'\]\.includes\(effectiveType\)/);
 assert.match(page,/effectiveType==='respondItem'&&ids\.length/);
});
test('Google Sites-style storage restriction never prevents guest join',()=>{
 assert.match(page,/try\{previousId=sessionStorage\.getItem\(key\)\}catch\{\}/);
 assert.match(page,/try\{sessionStorage\.setItem\(key,guestId\)\}catch\{\}/);
 assert.match(page,/const guestId=previousId\|\|randomId\(\)/);
});

test('source-backed Sell uses a dedicated action, reveals only offer and price, and accepts one Mirror',()=>{
 assert.match(page,/id="sell"/);
 assert.match(page,/id="incomingAttack"/);
 assert.match(page,/saleOffer\?\.definitionId/);
 assert.match(page,/saleOffer\.price/);
 assert.match(page,/type==='defend'&&view\.phase==='tradeDefense'\?'respondSale':type/);
 assert.match(page,/command\.saleInstanceId=ids\[0\]/);
 assert.match(page,/command\.soldInstanceId=ids\[1\]/);
 assert.match(page,/\['respondItem','respondSale'\]\.includes\(effectiveType\)/);
 assert.match(page,/売買を受け入れる/);
 assert.match(page,/スーパーミラーで反射/);
});
