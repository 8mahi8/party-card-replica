import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildOnlineHTML,ONLINE_MODULES} from '../v2/demo/build-online.mjs';

test('single HTML online bundle compiles game logic and client without JS module imports',()=>{
 const html=buildOnlineHTML();
 assert.match(html,/firebase-database-compat\.js/);
 assert.match(html,/firebase-app-compat\.js/);
 assert.match(html,/createFirebaseTwoSeatHostFixture/);
 assert.match(html,/joinFirebaseTwoSeatGuestFixture/);
 assert.match(html,/commandJson/);
 assert.doesNotMatch(html,/<script type="module">/);
 assert.doesNotMatch(html,/\s+src=['"][^'"]+\.mjs['"]/);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(scripts[0][1],{filename:'firebase-online-standalone.html'}));
 assert(ONLINE_MODULES.length>=30);
});

test('same build inputs produce byte-identical online HTML',()=>{
 assert.equal(buildOnlineHTML(),buildOnlineHTML());
});
