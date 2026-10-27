import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createV2LabController} from '../v2/lab-controller.mjs';
import {renderV2LabMarkup,mountV2Lab} from '../v2/lab-ui.mjs';

const firstHand=(v,i)=>({instanceId:v.hand[i].instanceId});
const learned=(id)=>({learnedDefinitionId:id});
function next(controller,selected=[]){
 controller.reveal();
 for(const value of selected)controller.toggle(value);
 return controller.submit();
}
test('initial hotseat view contains public stats but never shows either hand',()=>{
 const ui=createV2LabController(),v=ui.view();
 assert.equal(v.revealed,false);
 assert.equal(v.actorId,'A');
 assert.equal(v.phase,'turn');
 assert.equal(v.hand.length,0);
 assert.equal(v.learned.length,0);
 assert.equal(v.publicPlayers.length,2);
 const markup=renderV2LabMarkup(v);
 assert.match(markup,/data-action="reveal"/);
 assert.match(markup,/compact-pass/);
 assert.doesNotMatch(markup,/class="score"/,'handoff should not push reveal below short iframe');
 assert.doesNotMatch(markup,/ワンダーソード/);
 assert.doesNotMatch(markup,/アイアンアーマー/);
 assert.doesNotMatch(markup,/data-card="hand"/);
});
test('reveal, ordered selection and attack->defense->turn transition work',()=>{
 const ui=createV2LabController();
 const open=ui.reveal();
 assert.equal(open.hand.length,9);
 assert.match(renderV2LabMarkup(open),/data-card="hand"/);
 ui.toggle(firstHand(open,0));
 ui.toggle(firstHand(open,1));
 assert.deepEqual(ui.view().selection.map(x=>x.instanceId),
  [open.hand[0].instanceId,open.hand[1].instanceId]);
 const sent=ui.submit();
 assert.equal(sent.ok,true);
 assert.equal(sent.view.phase,'defense');
 assert.equal(sent.view.actorId,'B');
 assert.equal(sent.view.revealed,false);
 assert.match(sent.view.notice,/防御するプレイヤーに端末を渡して/);
 assert.equal(sent.view.hand.length,0);
 const defense=next(ui,[]);
 assert.equal(defense.ok,true);
 assert.equal(defense.view.phase,'turn');
 assert.equal(defense.view.actorId,'B');
 assert.equal(defense.view.revealed,false);
 assert.equal(ui.labSnapshot().players[1].hp,27);
});
test('the same card can be deselected without spending it',()=>{
 const ui=createV2LabController(),v=ui.reveal();
 const selected=firstHand(v,0);
 ui.toggle(selected);
 assert.equal(ui.view().selection.length,1);
 ui.toggle(selected);
 assert.equal(ui.view().selection.length,0);
 assert.equal(ui.labSnapshot().revision,0);
});
test('invalid combo does not mutate live room and lets the user retry',()=>{
 const ui=createV2LabController(),v=ui.reveal();
 ui.toggle(firstHand(v,0));ui.toggle(firstHand(v,2));ui.toggle(firstHand(v,3));
 const before=JSON.stringify(ui.labSnapshot());
 const bad=ui.submit();
 assert.equal(bad.ok,false);
 assert.equal(JSON.stringify(ui.labSnapshot()),before);
 assert.equal(bad.view.revealed,true);
 assert.equal(bad.view.selection.length,3);
 ui.toggle(firstHand(v,3));ui.toggle(firstHand(v,2));
 assert.equal(ui.submit().ok,true);
});
test('the pass screen hides the next player hand until explicitly revealed',()=>{
 const ui=createV2LabController();
 const hand=ui.reveal().hand;
 ui.toggle(firstHand({hand},0));ui.submit();
 const concealed=ui.view();
 assert.equal(concealed.actorId,'B');
 assert.equal(concealed.hand.length,0);
 assert.equal(concealed.learned.length,0);
 const hidden=renderV2LabMarkup(concealed);
 assert.doesNotMatch(hidden,/反射剣/);
 assert.doesNotMatch(hidden,/data-card="hand"/);
 assert.equal(ui.reveal().hand.some(x=>x.label.includes('反射剣')),true);
});
test('first hand miracle learns spell and can then cast without consuming it',()=>{
 const ui=createV2LabController();
 const first=ui.reveal();
 ui.toggle(firstHand(first,5));assert.equal(ui.submit().ok,true);
 assert.equal(next(ui,[]).ok,true);
 let state=ui.labSnapshot();
 assert.deepEqual(state.players[0].learned,['m002']);
 assert.equal(state.players[0].mp,8);
 const b=ui.reveal();
 ui.toggle(firstHand(b,6));assert.equal(ui.submit().ok,true);
 assert.equal(next(ui,[]).ok,true);
 const learnedView=ui.reveal();
 assert.equal(learnedView.learned.length,1);
 assert.equal(learnedView.learned[0].definitionId,'m002');
 ui.toggle(learned('m002'));
 assert.equal(ui.submit().ok,true);
 assert.equal(ui.view().phase,'defense');
 assert.equal(next(ui,[]).ok,true);
 state=ui.labSnapshot();
 assert.equal(state.players[0].mp,6);
 assert.equal(state.players[0].learned.length,1);
});
test('end of match produces a result screen without revealing hands',()=>{
 const ui=createV2LabController({
  hands:{A:['w025'],B:['d001']}
 });
 const v=ui.reveal();
 ui.toggle(firstHand(v,0));assert.equal(ui.submit().ok,true);
 assert.equal(next(ui,[]).ok,true);
 const final=ui.view();
 assert.equal(final.phase,'finished');
 assert.equal(final.winnerId,'A');
 assert.equal(final.hand.length,0);
 assert.match(renderV2LabMarkup(final),/検証試合終了/);
 assert.doesNotMatch(renderV2LabMarkup(final),/data-action="reveal"/);
});
test('two-step reset recreates a clean room and hides cards',()=>{
 const ui=createV2LabController();
 ui.reveal();
 const fresh=ui.reset();
 assert.equal(fresh.revealed,false);
 assert.equal(fresh.revision,0);
 assert.equal(fresh.hand.length,0);
 assert.equal(fresh.phase,'turn');
});
test('escaping arbitrary status text never injects markup into rendered view',()=>{
 const ui=createV2LabController(),view=ui.reveal();
 view.notice='<img src=x onerror=alert(1)>';
 const html=renderV2LabMarkup(view);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img /);
 assert.match(html,/data-action="submit"/);
});
test('mounted UI delegates ordinary button presses without additional dependencies',()=>{
 const listeners={};
 const root={
  innerHTML:'',
  addEventListener:(key,fn)=>{listeners[key]=fn;},
  contains:()=>true,
  querySelector:()=>null
 };
 const ui=createV2LabController(),mounted=mountV2Lab(root,ui);
 assert.match(root.innerHTML,/data-action="reveal"/);
 const fake=(attrs)=>({
  closest:()=>fakeNode,
 });
 let fakeNode;
 const press=attrs=>{
  fakeNode={
   getAttribute:name=>attrs[name]??null,
   hasAttribute:name=>Object.hasOwn(attrs,name)
  };
  listeners.click({target:{closest:()=>fakeNode}});
 };
 press({'data-action':'reveal'});
 assert.match(root.innerHTML,/data-card="hand"/);
 const selected=ui.view().hand[0].instanceId;
 press({'data-card':'hand','data-id':encodeURIComponent(selected)});
 assert.equal(ui.view().selection.length,1);
 press({'data-action':'submit'});
 assert.equal(ui.view().phase,'defense');
 assert.match(root.innerHTML,/data-action="reveal"/);
 assert.strictEqual(mounted.controller,ui);
});
test('deterministic single HTML bundle is checked into the V2 development branch',()=>{
 const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
 const proc=spawnSync(process.execPath,[path.join(root,'v2/demo/build.mjs'),'--check'],{
  cwd:root,encoding:'utf8',timeout:20000
 });
 assert.equal(proc.status,0,proc.stderr||proc.stdout);
});

test('invalid empty-card confirm displays an error even after DOM rerender',()=>{
 const listeners={},message={textContent:''};
 const root={innerHTML:'',
   addEventListener:(key,handler)=>{listeners[key]=handler;},
   contains:()=>true,
   querySelector:selector=>selector==='[role="status"]'?message:null
 };
 const ui=createV2LabController();
 mountV2Lab(root,ui);
 const click=action=>{
   const button={
     getAttribute:key=>key==='data-action'?action:null,
     hasAttribute:()=>false
   };
   listeners.click({target:{closest:()=>button}});
 };
 click('reveal');
 click('submit');
 assert.match(message.textContent,/使用するカードを選んで/);
 assert.equal(ui.view().phase,'turn');
 assert.equal(ui.view().revealed,true);
});

test('handoff scroll resets embedded frame but ordinary card taps do not',()=>{
 const listeners={},positions=[];
 const root={
  ownerDocument:{defaultView:{scrollTo:(x,y)=>positions.push([x,y])}},
  innerHTML:'',
  addEventListener:(key,fn)=>{listeners[key]=fn;},
  contains:()=>true,
  querySelector:()=>null
 };
 const controller=createV2LabController();
 mountV2Lab(root,controller);
 const press=attrs=>{
  const button={getAttribute:k=>attrs[k]??null,hasAttribute:k=>Object.hasOwn(attrs,k)};
  listeners.click({target:{closest:()=>button}});
 };
 press({'data-action':'reveal'});
 const id=controller.view().hand[0].instanceId;
 press({'data-card':'hand','data-id':encodeURIComponent(id)});
 assert.deepEqual(positions,[],'ordinary tap should not reset scroll');
 press({'data-action':'submit'});
 assert.equal(controller.view().phase,'defense');
 assert.deepEqual(positions,[[0,0]],'handoff should move frame to top');
 press({'data-action':'reveal'});
 press({'data-action':'submit'});
 assert.equal(controller.view().phase,'turn');
 assert.deepEqual(positions,[[0,0],[0,0]],'next turn should also scroll to top');
 press({'data-action':'reset'});
 assert.equal(positions.length,2,'arming reset must not scroll');
 press({'data-action':'reset'});
 assert.deepEqual(positions,[[0,0],[0,0],[0,0]],'reset scrolls after confirmation');
});

// Four-or-more ordinary shield cards must remain usable after the G3
// special-reaction parser was hardened. No original-rule three-card cap.
test('four real controller shield taps protect against an ice miracle',()=>{
 const lab=createV2LabController({hands:{
   A:['m002'],B:['d014','d014','d014','d014']
 }});
 let hand=lab.reveal().hand;
 lab.toggle({instanceId:hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().phase,'defense');
 hand=lab.reveal().hand;
 for(const card of hand)lab.toggle({instanceId:card.instanceId});
 assert.deepEqual(lab.view().selection.map(x=>x.instanceId),
   hand.map(x=>x.instanceId));
 const response=lab.submit();
 assert.equal(response.ok,true,response.error);
 assert.equal(response.view.phase,'turn');
 assert.equal(response.view.revealed,false);
 assert.equal(lab.labSnapshot().players[1].hp,40);
 assert.equal(lab.labSnapshot().players[1].hand.length,4);
 assert.equal(lab.labSnapshot().players[0].mp,8);
});


test('Sky -> Moonlight switches to the latest miracle defense in one tap',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['d024','d029']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const cards=lab.reveal().hand,sky=cards[0],moon=cards[1];
 lab.toggle({instanceId:sky.instanceId});
 const previous=JSON.stringify(lab.labSnapshot()),revision=lab.view().revision;
 lab.toggle({instanceId:moon.instanceId});
 assert.deepEqual(lab.view().selection,[{instanceId:moon.instanceId}]);
 assert.equal(JSON.stringify(lab.labSnapshot()),previous);
 assert.equal(lab.view().revision,revision);
 assert.doesNotMatch(lab.view().notice,/この検証版では/);
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().actorId,'A');
 assert.equal(lab.labSnapshot().players[1].hand.length,1);
});
test('switching Moonlight -> Sky -> Moonlight works repeatedly without reset',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['d024','d029']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const b=lab.reveal();
 for(const i of [1,0,1])lab.toggle({instanceId:b.hand[i].instanceId});
 assert.deepEqual(lab.view().selection,[{instanceId:b.hand[1].instanceId}]);
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().actorId,'A');
});
test('ordinary guards -> reaction and reaction -> ordinary guards replace, never stack',()=>{
 for(const cards of [
   ['d014','d024'],['d024','d014'],
   ['d024','d018'],['d018','d029'],
   ['i001','d029'],['i002','d014']
 ]){
  const lab=createV2LabController({hands:{A:['m002'],B:cards}});
  const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
  assert.equal(lab.submit().ok,true);
  const b=lab.reveal();
  lab.toggle({instanceId:b.hand[0].instanceId});
  lab.toggle({instanceId:b.hand[1].instanceId});
  assert.deepEqual(lab.view().selection,[{instanceId:b.hand[1].instanceId}],cards.join(','));
 }
});
test('plain armor stacks remain intact until a special defense method is tapped',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['d014','d014','d024']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const b=lab.reveal();
 lab.toggle({instanceId:b.hand[0].instanceId});
 lab.toggle({instanceId:b.hand[1].instanceId});
 assert.equal(lab.view().selection.length,2);
 lab.toggle({instanceId:b.hand[2].instanceId});
 assert.deepEqual(lab.view().selection,[{instanceId:b.hand[2].instanceId}]);
});
test('Turbulence -> Spirit remains valid, later Sky replaces the whole sequence',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['m007','i003','d024']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const b=lab.reveal();
 lab.toggle({instanceId:b.hand[0].instanceId});
 lab.toggle({instanceId:b.hand[1].instanceId});
 assert.deepEqual(lab.view().selection,
   [{instanceId:b.hand[0].instanceId},{instanceId:b.hand[1].instanceId}]);
 lab.toggle({instanceId:b.hand[2].instanceId});
 assert.deepEqual(lab.view().selection,[{instanceId:b.hand[2].instanceId}]);
 assert.equal(lab.submit().ok,true);
 assert.equal(lab.view().actorId,'A');
});
test('Sky -> learned Turbulence -> Spirit replaces defense and waives MP',()=>{
 const lab=createV2LabController({hands:{A:['m002'],B:['d024','i003']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 // The learned list is an engine state; the fixture test sets it up through
 // a previous initial cast in separate tests. Here use the first-use version.
 const b=lab.reveal();
 lab.toggle({instanceId:b.hand[0].instanceId});
 lab.toggle({instanceId:b.hand[1].instanceId});
 assert.deepEqual(lab.view().selection,[{instanceId:b.hand[0].instanceId}],
   'a Spirit doll cannot replace an armor method by itself');
});
test('ordinary weapon still permits stacking Sky, Moonlight and standard armor',()=>{
 const lab=createV2LabController({hands:{A:['w016'],B:['d024','d029','d005']}});
 const a=lab.reveal();lab.toggle({instanceId:a.hand[0].instanceId});
 assert.equal(lab.submit().ok,true);
 const b=lab.reveal();
 for(const x of b.hand)lab.toggle({instanceId:x.instanceId});
 assert.equal(lab.view().selection.length,3);
 const result=lab.submit();
 assert.equal(result.ok,true,result.error);
 assert.equal(lab.labSnapshot().players[1].hp,40);
});
