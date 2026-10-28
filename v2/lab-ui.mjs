/**
 * Minimal accessible and touch-friendly offline V2 hotseat UI.
 * All render output is generated from a PLAYER-SPECIFIC lab controller view.
 */
import {createV2LabController} from './lab-controller.mjs';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);
const attr=x=>esc(encodeURIComponent(x));
const seatLabel=id=>id==='A'?'P1':id==='B'?'P2':'P'+id;
const elem=x=>({none:'無',fire:'火',water:'水',wood:'木',earth:'土',light:'光',dark:'闇'})[x]??'—';
function portrait(p){
 return '<div class="seat"><div><strong>'+esc(seatLabel(p.id))+'</strong> <small>手札'+p.handCount+'枚</small></div>'+
 '<div class="values"><span>HP <b>'+p.hp+'</b></span><span>MP <b>'+p.mp+
 '</b></span><span>¥ <b>'+p.money+'</b></span></div></div>';
}
function cardButton(c,type){
 const picked=c.selectedOrder>0;
 return '<button type="button" class="battle-card'+(picked?' picked':'')+
 '" data-card="'+type+'" data-id="'+attr(type==='hand'?c.instanceId:c.definitionId)+
 '" aria-pressed="'+picked+'"><span class="rank">'+(picked?c.selectedOrder:'+')+
 '</span><span class="card-label">'+esc(c.label)+'</span><small>'+
 (type==='hand'?'手札 · '+elem(c.element):'習得済み奇跡')+'</small></button>';
}
export function renderV2LabMarkup(data,{resetArmed=false}={}){
 const text=data.phase==='turn'?'攻撃':data.phase==='defense'?'防御':'終了';
 const topLine='<div class="topline"><div><strong class="brand">CARD LAB <em>V2</em></strong>'+
 '<div class="sub">学校iPad用・ルール検証だけの試遊版</div></div>'+
 '<span class="phase">'+text+'</span></div>';
 const header=topLine+
 '<div class="disclaimer">⚠ <strong>オフライン1台交代制</strong>・固定カード補充によるテスト。'+
 'オンライン対戦・原作の出現率・全カード再現ではありません。</div>'+
 '<section class="score" aria-label="プレイヤーの状態">'+data.publicPlayers.map(portrait).join('')+'</section>';
 const footer='<footer><button type="button" class="quiet" data-action="reset">'+
 (resetArmed?'もう一度押すと試合を初期化':'最初からやり直す')+
 '</button><small>対戦ログの保存・ネットワーク通信は行いません。</small></footer>';
 if(data.phase==='finished'){
   return header+'<section class="stage" aria-live="polite"><h1>検証試合終了</h1><p>勝者：'+
     (data.winnerId?esc(seatLabel(data.winnerId)):'引き分け')+'</p><p class="status">'+
     esc(data.notice)+'</p></section>'+footer;
 }
 if(!data.revealed){
   // Hide the large stats/disclaimer block during private handoff so the
   // reveal button remains visible in a short Google Sites-style iframe.
   return topLine+'<section class="pass-screen compact-pass" aria-live="polite">'+
     '<div class="seal" aria-hidden="true">◈</div><h1>'+esc(seatLabel(data.actorId))+' の番</h1>'+
     '<p>'+esc(data.notice)+'</p><p class="hint">端末を'+esc(seatLabel(data.actorId))+
     'へ渡してから手札を表示してください</p>'+
     '<button type="button" class="primary wide" data-action="reveal">自分の手札を見る</button>'+
     '</section>'+footer;
 }
 const title=data.phase==='turn'?'攻撃するカードを順番に選択':'防御カードを順番に選択';
 const firstPicked=data.selection[0]?.instanceId
   ?data.hand.find(c=>c.instanceId===data.selection[0].instanceId):null;
 const soloPlusMiracle=data.phase==='turn' && firstPicked?.family==='miracle' &&
   firstPicked.playModes.includes('addAttack');
 const selectedWeapon=data.phase==='turn' && data.selection.some(x=>
   x.instanceId&&data.hand.some(c=>c.instanceId===x.instanceId&&c.family==='weapon'));
 const caption=data.phase==='turn'
   ?(selectedWeapon?'武器は「捨てる」対象外です。攻撃に使うか、他のカードを選んでください'
   :soloPlusMiracle
     ?'火の玉・流星を先頭に選ぶと単独奇跡。続けられるのは直後の精霊のみ'
     :data.canPray&&data.selection.length===0
       ?'武器がないときは「祈る」で神器を1枚引いて手番を終える'
       :'＋攻の追加武器だけでも攻撃可。選んだ順に処理')
   :'何も選ばず確定すれば無防御';
 const targets=data.phase==='turn'?
    '<section class="targets"><h2>攻撃先</h2><div class="choice-row">'+
    data.targets.map(id=>'<button type="button" class="'+(id===data.targetId?'chosen':'')+
      '" data-target="'+attr(id)+'" aria-pressed="'+(id===data.targetId)+'">'+esc(seatLabel(id))+
      (id===data.actorId?'（自分）':'')+'</button>').join('')+
    '</div></section>':'';
 const picked=data.selection.map((x,i)=>{
   const c=x.instanceId?data.hand.find(q=>q.instanceId===x.instanceId):
     data.learned.find(q=>q.definitionId===x.learnedDefinitionId);
   return '<span class="pick-index">'+(i+1)+'. '+esc(c?.label??'選択中')+'</span>';
 }).join('');
 const actionText=data.phase==='defense'?(data.selection.length?'防御を確定':'防御しない')
   :data.canPray&&data.selection.length===0?'祈る（神器を1枚引く）':'攻撃を確定';
 const notice='<p class="status" role="status">'+esc(data.notice)+'</p>';
 const discardOption=data.phase==='turn' && data.canDiscardSelection
   ?'<button type="button" class="quiet discard-option" data-action="discard">'+
     '<strong>'+data.selection.length+'枚捨てる</strong><small>補充なし・ターン終了</small>'+
     '</button>'
   :'';
 return header+'<main class="stage">'+
   '<div class="stage-heading"><h1>'+esc(seatLabel(data.actorId))+'：'+title+'</h1><p>'+caption+'</p></div>'+
   targets+'<section class="cards-panel"><h2>手札 <small>'+data.hand.length+'枚</small></h2>'+
   '<div class="hand-grid">'+(data.hand.length?data.hand.map(c=>cardButton(c,'hand')).join(''):
       '<p class="empty">手札がありません</p>')+'</div></section>'+
   '<section class="cards-panel"><h2>習得済み奇跡</h2><div class="hand-grid">'+
   (data.learned.length?data.learned.map(c=>cardButton(c,'learned')).join(''):
       '<p class="empty">まだ習得していません</p>')+'</div></section>'+
   '<section class="selection"><h2>選択順 <small>再タップで解除</small></h2><div class="picks">'+
   (picked||'<span class="muted">まだ選択されていません</span>')+'</div></section>'+
   notice+'<div class="action-bar">'+discardOption+
   '<button type="button" class="primary wide confirm" data-action="submit">'+
   actionText+'</button></div></main>'+footer;
}
export function mountV2Lab(root,controller=createV2LabController()){
 if(!root||typeof root.addEventListener!=='function')throw new Error('Root element required');
 let resetArmed=false;
 const render=()=>{root.innerHTML=renderV2LabMarkup(controller.view(),{resetArmed});};
 root.addEventListener('click',event=>{
   const node=event.target?.closest?.('button');
   if(!node||!root.contains(node))return;
   const action=node.getAttribute('data-action');
   const kind=node.getAttribute('data-card');
   let localError=null;
   let handoff=false;
   let submitRejected=false;
   try{
     if(action==='reset'){
       if(!resetArmed)resetArmed=true;
       else{controller.reset();resetArmed=false;handoff=true;}
     }else if(action==='reveal'){
       resetArmed=false;controller.reveal();
     }else if(action==='submit'||action==='discard'){
       resetArmed=false;
       const outcome=controller.submit({discard:action==='discard'});
       // A successful command conceals the cards or ends the match.
       // Scroll back to the top inside the embed frame so the next player
       // sees the pass screen rather than an empty bottom viewport.
       handoff=outcome.ok && !outcome.view.revealed;
       submitRejected=!outcome.ok;
     }else if(kind==='hand'){
       resetArmed=false;controller.toggle({instanceId:decodeURIComponent(node.getAttribute('data-id'))});
     }else if(kind==='learned'){
       resetArmed=false;controller.toggle({learnedDefinitionId:decodeURIComponent(node.getAttribute('data-id'))});
     }else if(node.hasAttribute('data-target')){
       resetArmed=false;controller.setTarget(decodeURIComponent(node.getAttribute('data-target')));
     }else return;
   }catch(error){
     localError=String(error?.message??'この操作はできません').slice(0,180);
   }
   render();
   // Scroll the frame, not the hosting Google Sites page. Do this only
   // after successful handoff/reset, never on ordinary card selection.
   if(handoff)root.ownerDocument?.defaultView?.scrollTo?.(0,0);
   // An invalid tap must remain visible after the full screen rerenders.
   if(localError){
     const feedback=root.querySelector?.('[role="status"]');
     if(feedback)feedback.textContent=localError;
   }
   // A rejected submission keeps the turn editable. In short embed frames,
   // bring the explanation above the fixed confirm bar by scrolling only
   // THIS iframe window, never the parent Google Sites page.
   if(submitRejected||localError){
     const feedback=root.querySelector?.('[role="status"]');
     const win=root.ownerDocument?.defaultView;
     if(feedback&&win){
       const note=feedback.getBoundingClientRect();
       const confirmTop=root.querySelector?.('.confirm')?.getBoundingClientRect().top
         ??win.innerHeight;
       const delta=note.bottom>confirmTop-12 ? note.bottom-(confirmTop-12)
         :note.top<12 ? note.top-12 : 0;
       if(delta)win.scrollTo(0,Math.max(0,win.scrollY+delta));
     }
   }
 });
 render();
 return {render,controller};
}
