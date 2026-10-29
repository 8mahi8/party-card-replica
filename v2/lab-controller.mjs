/**
 * Offline 2-seat V2 lab controller.
 *
 * Owns an authoritative game state for same-device HOT-SEAT testing only.
 * Never expose this controller as an online endpoint: a real match needs a
 * trusted room owner, seat authentication, CAS, and audited card draws.
 */
import {migrateLegacyCatalog} from './legacy-adapter.mjs';
import {createStagingRoom,viewStagingRoom} from './staging-room.mjs';
import {submitAndResolveFixture} from './room-transition.mjs';
import {VERIFIED_BASIC_CARDS} from '../src/verified-basic-cards.mjs';

const DEFAULT_HANDS=Object.freeze({
  A:['w016','a003','m004','m005','d005','m002','i003','w027','d001'],
  B:['w027','d024','m001','i001','d029','m007','w016','i002','i003']
});
const names=new Map(VERIFIED_BASIC_CARDS.map(x=>[x.id,x.referenceName]));
const FALLBACK_DRAW='d001';
const TRADE_TRIAL_HANDS=Object.freeze({
 A:Object.freeze(['t001','w003','d005']),B:Object.freeze(['i002','d001'])
});
// The opponent may own a real Super Mirror, but its Buy-reflection outcome
// is not implemented. Position 1 gives a deterministic affordable item.
const BUY_TRIAL_HANDS=Object.freeze({
 A:Object.freeze(['t002','d001']),B:Object.freeze(['d005','i002'])
});
const EXCHANGE_TRIAL_HANDS=Object.freeze({
 A:Object.freeze(['t003','d001']),B:Object.freeze(['d005','i002'])
});

function safeMessage(error){
  const msg=error?.message;
  // A lab-only limitation, not a definitive rule of the original game.
  if(msg==='Weapon or armor after plus miracle unverified')
    return 'この選択順は原作で未確認です。＋攻の追加武器を奇跡より前に選ぶか、解除してください';
  if(msg==='Buy mirror response requires original verification')
    return '「買う」のスーパーミラー反射後の処理は原作の確認待ちです。選択を解除して「買うを許す」で続けられます';
  if(msg==='Attack must start with a weapon or offensive miracle')
    return 'ちからの粉などの雑貨は単独で攻撃できません。最初に武器を選んでください';
  return typeof msg==='string' && msg.length<=230 ? msg : 'この操作は現在の実験版では使えません';
}
function otherSeat(state,actor){
  return state.players.find(p=>p.id!==actor)?.id??null;
}
function keyOf(item){
  return item?.instanceId ? 'h:'+item.instanceId
    : item?.learnedDefinitionId ? 'l:'+item.learnedDefinitionId : null;
}
// For a miracle attack, different defensive METHODS are exclusive in the
// source game UI: tapping another method replaces the previous selection.
// Keep this hotseat behavior separate from command/resolution validation.
// Original-client observation comes from the player; exact edge cases for
// support items still require original Training confirmation.
function pendingAttackIsMiracle(state,catalog){
 const pending=state.pending;
 if(state.phase!=='defense'||pending?.type!=='attack')return false;
 if(pending.attackContext)return pending.attackContext.attackKind==='miracle';
 if(pending.attackLearnedDefinitionId!==undefined)return true;
 const first=pending.attackSequence?.[0]?.instanceId??pending.attackInstanceIds?.[0];
 const caster=state.players.find(p=>p.id===pending.originalAttackerId);
 const instance=caster?.hand.find(c=>c.instanceId===first);
 return catalog.get(instance?.definitionId)?.family==='miracle';
}
function isMiracleReaction(def){
 return def?.effects.some(e=>e.when==='onDefense'&&(
  (e.type==='stopAttack'&&e.params.scope==='miracle')||
  (e.type==='redirectAttack'&&['miracle','any'].includes(e.params.scope))
 ));
}
function isSpirit(def){
 return def?.family==='item'&&def.effects.length===1&&
  def.effects[0].when==='onCost'&&def.effects[0].type==='waivePreviousMp'&&
  def.effects[0].params.target==='previousMiracle';
}
function defenseDefinition(actor,step,catalog){
 const id=step.instanceId
   ?actor.hand.find(x=>x.instanceId===step.instanceId)?.definitionId
   :step.learnedDefinitionId;
 return catalog.get(id);
}
function nextMiracleDefenseSelection(actor,previous,choice,catalog){
 const chosen=defenseDefinition(actor,choice,catalog);
 const active=previous.map(step=>defenseDefinition(actor,step,catalog));
 if(isMiracleReaction(chosen))return [choice];
 const oldReaction=active.some(isMiracleReaction);
 if(!oldReaction)return [...previous,choice];
 const first=active[0];
 // A defensive miracle followed DIRECTLY by Spirit remains a single method
 // with a cost waiver, rather than an independent defense choice.
 if(isSpirit(chosen)&&previous.length===1&&isMiracleReaction(first)&&
   first.family==='miracle')return [...previous,choice];
 // A support item is not a defense method on its own. It cannot replace an
 // armor reaction; avoid silently creating an invalid Spirit-only selection.
 if(isSpirit(chosen))return previous;
 return [choice];
}
function baseLabel(def){
  if(!def)return '未登録';
  const stat=def.stats;
  const override=def.effects.find(e=>e.when==='onDeclare'&&e.type==='setAttackElement');
  const plusAttack=def.playModes.includes('addAttack') &&
    (def.family==='weapon'&&!def.playModes.includes('mainAttack') ||
     ['miracle','item'].includes(def.family)&&def.effects.some(e=>e.type==='addAttack'&&
       e.when==='onDeclare'&&e.params.scope==='weapon'));
  return [
    names.get(def.id)??def.id,
    stat.attack ? (plusAttack ? '+攻' : '攻')+stat.attack : '',
    stat.guard ? '守'+stat.guard : '',
    stat.mpCost ? 'MP'+stat.mpCost : '',
    override ? '攻撃属性→'+({fire:'火',water:'水'}[override.params.element]??'?') : ''
  ].filter(Boolean).join(' · ');
}
export function createV2LabController({
  hands=DEFAULT_HANDS,
  firstSeatId='A',
  fixtureDrawDefinitionId=FALLBACK_DRAW
}={}){
  const {byId:catalog,summary}=migrateLegacyCatalog();
  if(!catalog.has(fixtureDrawDefinitionId))
    throw new Error('Unknown fixture draw card');
  const handEntries=Object.entries(hands).map(([id,handDefinitionIds])=>({
    id,handDefinitionIds:[...handDefinitionIds]
  }));
  let state=createStagingRoom({
    seats:handEntries,firstSeatId,rulesetId:'partial-reference-v2-lab'
  },catalog);
  let selected=[],visible=false,targetId=otherSeat(state,state.activePlayerId);
  let notice='手番プレイヤーだけが「手札を見る」を押してください';
  let commandSerial=0;
  let tradeTrial=false,buyTrial=false,exchangeTrial=false,exchangeDraft=null;

  const active=()=>state.activePlayerId;
  function pendingActor(){
    if(state.phase==='finished')return null;
    return active();
  }
  function own(){
    const id=pendingActor();
    return state.players.find(p=>p.id===id);
  }
  function view(){
    const actor=own();
    const status={
      revealed:visible,phase:state.phase,revision:state.revision,
      actorId:actor?.id??null,notice,targetId,
      winnerId:state.winnerId??null,
      selection:[...selected],
      canDiscardSelection:state.phase==='turn' && selected.length>0 &&
        selected.every(x=>x.instanceId &&
          catalog.get(actor?.hand.find(c=>c.instanceId===x.instanceId)?.definitionId)
            ?.discardPolicy==='ordinary'),
      cardSetComplete:summary.complete,
      cardSetCount:summary.unique,tradeTrial,buyTrial,exchangeTrial,
      exchangeAllocation:visible&&state.phase==='turn'&&exchangeDraft?
        {...exchangeDraft}:null
    };
    if(state.phase==='finished'){
      return {...status,publicPlayers:state.players.map(p=>({
        id:p.id,hp:p.hp,mp:p.mp,money:p.money,handCount:p.hand.length
      })),pending:null,hand:[],learned:[],targets:[]};
    }
    // Never leak the opposing physical hand from this projection.
    const projected=viewStagingRoom(state,actor.id);
    const self=projected.players.find(p=>p.id===actor.id);
    const hand=self.hand.map(card=>{
      const def=catalog.get(card.definitionId);
      return {instanceId:card.instanceId,definitionId:card.definitionId,
        label:baseLabel(def),family:def.family,element:def.element,
        playModes:[...def.playModes],
        tradeAction:def.effects.find(e=>e.when==='onDeclare'&&
          ['forceSale','requestBuy','reallocateResources'].includes(e.type))?.params.kind??null,
        canReflectTrade:def.effects.some(e=>e.when==='onDefense'&&e.type==='redirectAttack'&&
          e.params.mode==='reflect'&&e.params.scope==='any'),
        tradeSelectable:!['tradeDefense','buyDefense'].includes(state.phase)||def.effects.some(e=>
          e.when==='onDefense'&&e.type==='redirectAttack'&&e.params.mode==='reflect'&&
          e.params.scope==='any'),
        selectedOrder:selected.findIndex(x=>x.instanceId===card.instanceId)+1};
    });
    const learned=self.learned.map(id=>{
      const def=catalog.get(id);
      return {definitionId:id,label:baseLabel(def),
        family:def?.family??'unknown',
        selectedOrder:selected.findIndex(x=>x.learnedDefinitionId===id)+1};
    });
    return {...status,
      // Includes addon weapons; only an entirely weaponless hand may pray.
      canPray:!self.hand.some(card=>catalog.get(card.definitionId)?.family==='weapon'),
      publicPlayers:projected.players.map(p=>({
      id:p.id,hp:p.hp,mp:p.mp,money:p.money,handCount:p.handCount
    })),
      pending:projected.pending?.offer?{
        ...projected.pending,offer:{...projected.pending.offer,
          label:names.get(projected.pending.offer.definitionId)??projected.pending.offer.definitionId}
      }:projected.pending,
      hand:visible?hand:[],
      learned:visible?learned:[],
      targets:state.phase==='turn'?state.players.filter(p=>p.hp>0).map(p=>p.id):[]
    };
  }
  function reveal(){
    if(state.phase==='finished')return view();
    visible=true;notice='カードを順番にタップして選択';
    return view();
  }
  function toggle(selection){
    if(!visible || state.phase==='finished')throw new Error('先に自分の手札を表示してください');
    const player=own(),key=keyOf(selection);
    if(!key)throw new Error('Invalid selection');
    const idx=selected.findIndex(x=>keyOf(x)===key);
    if(idx>=0){selected.splice(idx,1);return view();}
    if(['tradeDefense','buyDefense'].includes(state.phase)&&selection.learnedDefinitionId)
      throw new Error('取引を跳ね返すには手札のスーパーミラーを選んでください');
    if(selection.instanceId){
      const held=player.hand.find(card=>card.instanceId===selection.instanceId);
      if(!held)throw new Error('そのカードは現在の手札にありません');
      if(['tradeDefense','buyDefense'].includes(state.phase)){
        const def=catalog.get(held.definitionId);
        if(!def?.effects.some(e=>e.when==='onDefense'&&e.type==='redirectAttack'&&
          e.params.mode==='reflect'&&e.params.scope==='any'))
          throw new Error('取引に使える防御はスーパーミラーだけです');
      }
    } else {
      if(!player.learned.includes(selection.learnedDefinitionId))
        throw new Error('その奇跡は習得していません');
      if(state.phase==='defense' &&
        !catalog.get(selection.learnedDefinitionId)?.playModes.includes('defend'))
        throw new Error('防御奇跡を選択してください');
    }
    const choice={...selection};
    if(['tradeDefense','buyDefense'].includes(state.phase)){
      selected=[choice];notice='スーパーミラーを選択中。使わない場合はもう一度タップ';
      return view();
    }
    if(pendingAttackIsMiracle(state,catalog)){
      const next=nextMiracleDefenseSelection(player,selected,choice,catalog);
      if(next.length>18)throw new Error('一度に選択できるカード数を超えました');
      selected=next;
      notice='カードを順番にタップして選択';
      return view();
    }
    if(selected.length>=18)throw new Error('一度に選択できるカード数を超えました');
    if(state.phase==='defense'){
      if(selection.instanceId && selected.some(x=>x.learnedDefinitionId)){
        const def=defenseDefinition(player,choice,catalog);
        if(!def?.playModes.includes('support'))
          throw new Error('習得済み防御奇跡の後には補助雑貨のみ選べます');
      }
      if(selection.learnedDefinitionId && selected.some(x=>x.learnedDefinitionId))
        throw new Error('防御奇跡を1つだけ選択してください');
    }
    selected.push(choice);
    if(state.phase==='turn'&&choice.instanceId){
      const chosen=player.hand.find(x=>x.instanceId===choice.instanceId);
      const def=catalog.get(chosen?.definitionId);
      if(def?.effects.some(e=>e.type==='reallocateResources'&&
        e.when==='onDeclare'&&e.params.kind==='exchange'))
        exchangeDraft={hp:player.hp,mp:player.mp,money:player.money};
    }
    return view();
  }
  function setTarget(id){
    if(!visible||state.phase!=='turn')throw new Error('攻撃ターゲットは手番中のみ指定できます');
    if(!state.players.some(p=>p.id===id&&p.hp>0))
      throw new Error('攻撃先が無効です');
    targetId=id;return view();
  }
  function submit({discard=false,accept,allocation}={}){
    if(!visible)throw new Error('手札表示後に操作してください');
    const actor=own();
    if(!actor)throw new Error('試合は終了しました');
    const n='lab-'+(++commandSerial);
    let command;
    if(discard){
      if(state.phase!=='turn')throw new Error('捨てるは自分の手番だけ使えます');
      if(!selected.length||selected.some(x=>!x.instanceId))
        throw new Error('捨てる神器を手札から選んでください');
      command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
        type:'discard',orderedInstanceIds:selected.map(x=>x.instanceId)};
    }else if(state.phase==='buyDecision'){
      if(typeof accept!=='boolean')
        throw new Error('買うか買わないかを選んでください');
      command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
        type:'decideBuy',accept};
    }else if(state.phase==='buyDefense'){
      if(selected.length>1||selected.some(x=>!x.instanceId))
        throw new Error('買うへの防御はスーパーミラー1枚だけです');
      command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
        type:'respondBuy',...(selected.length?{mirrorInstanceId:selected[0].instanceId}:{})};
    }else if(state.phase==='tradeDefense'){
      if(selected.length>1||selected.some(x=>!x.instanceId))
        throw new Error('取引防御ではスーパーミラーを1枚だけ選んでください');
      command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
        type:'respondSale',...(selected.length?{mirrorInstanceId:selected[0].instanceId}:{})};
    }else if(state.phase==='defense'){
      const learned=selected.filter(x=>x.learnedDefinitionId);
      if(learned.length>1)throw new Error('習得済み防御奇跡は1つまで');
      command=learned.length
        ?{commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'defendSequence',orderedPlays:[...selected]}
        :{commandId:n,expectedRevision:state.revision,actorId:actor.id,type:'defend',
          orderedInstanceIds:selected.filter(x=>x.instanceId).map(x=>x.instanceId)};
    } else if(state.phase==='turn'){
      if(!selected.length &&
         actor.hand.some(card=>catalog.get(card.definitionId)?.family==='weapon'))
        throw new Error('使用するカードを選んでください');
      if(!selected.length){
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,type:'pray'};
      }else if(selected[0]?.instanceId&&
         catalog.get(actor.hand.find(c=>c.instanceId===selected[0].instanceId)?.definitionId)
           ?.effects.some(e=>e.when==='onDeclare'&&e.type==='forceSale'&&e.params.kind==='sell')){
        if(selected.length!==2||selected.some(x=>!x.instanceId))
          throw new Error('「売る」と売り渡す神器の順に2枚選んでください');
        if(targetId===actor.id)throw new Error('自分への売却は原作確認まで研究版では扱いません');
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'declareSale',targetId,saleInstanceId:selected[0].instanceId,
          soldInstanceId:selected[1].instanceId};
      }else if(selected[0]?.instanceId&&
         catalog.get(actor.hand.find(c=>c.instanceId===selected[0].instanceId)?.definitionId)
           ?.effects.some(e=>e.when==='onDeclare'&&e.type==='requestBuy'&&e.params.kind==='buy')){
        if(selected.length!==1)
          throw new Error('「買う」だけを1枚選んでください');
        if(targetId===actor.id)throw new Error('自分への買うは原作確認まで研究版では扱いません');
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'declareBuy',targetId,buyInstanceId:selected[0].instanceId};
      }else if(selected[0]?.instanceId&&
         catalog.get(actor.hand.find(c=>c.instanceId===selected[0].instanceId)?.definitionId)
           ?.effects.some(e=>e.when==='onDeclare'&&e.type==='reallocateResources'&&e.params.kind==='exchange')){
        if(selected.length!==1)throw new Error('「両替」だけを1枚選んでください');
        if(!allocation||typeof allocation!=='object')
          throw new Error('HP・MP・¥の配分を入力してください');
        exchangeDraft={...allocation};
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'exchange',exchangeInstanceId:selected[0].instanceId,
          allocation:{...exchangeDraft}};
      }else if(selected.length===1&&selected[0].learnedDefinitionId){
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'castLearned',learnedDefinitionId:selected[0].learnedDefinitionId,targetId};
      } else if(selected.some(x=>x.learnedDefinitionId)){
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'playSequence',targetId,orderedPlays:[...selected]};
      } else {
        command={commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'playCards',targetId,
          orderedInstanceIds:selected.map(x=>x.instanceId)};
      }
    } else throw new Error('現在は操作できません');
    try {
      // The isolated controller IS the temporary room owner for the lab.
      const result=submitAndResolveFixture(state,command,catalog,{
        authorizedSeatId:actor.id,labOnly:true,
        fixtureDrawDefinitionId
      });
      state=result.state;
      selected=[];exchangeDraft=null;
      visible=false;
      targetId=state.phase==='turn'?otherSeat(state,state.activePlayerId):null;
      notice=state.phase==='finished'?'検証試合が終了しました':
        result.state.phase==='defense'?'防御するプレイヤーに端末を渡してください':
        ['tradeDefense','buyDefense'].includes(result.state.phase)?
          '取引相手に端末を渡してください':
        result.state.phase==='buyDecision'?
          '購入するプレイヤーに端末を戻してください':
          '手番が進みました。次のプレイヤーに渡してください';
      return {ok:true,view:view(),events:result.events.map(x=>({type:x.type})),
        changedRevision:state.revision};
    } catch(error){
      // Caller sees only the reason for failure, never an applied partial state.
      notice=safeMessage(error);
      return {ok:false,error:notice,view:view(),changedRevision:state.revision};
    }
  }
  function loadTradeTrial(){
    state=createStagingRoom({
      seats:Object.entries(TRADE_TRIAL_HANDS).map(([id,handDefinitionIds])=>({id,handDefinitionIds:[...handDefinitionIds]})),
      firstSeatId:'A',rulesetId:'partial-reference-v2-lab'
    },catalog);
    tradeTrial=true;buyTrial=false;exchangeTrial=false;exchangeDraft=null;selected=[];visible=false;targetId='B';commandSerial=0;
    notice='取引研究モードです。P1が「売る」→商品を選び、P2が応答します';
    return view();
  }
  function loadBuyTrial(){
    state=createStagingRoom({
      seats:Object.entries(BUY_TRIAL_HANDS).map(([id,handDefinitionIds])=>({
        id,handDefinitionIds:[...handDefinitionIds]
      })),
      firstSeatId:'A',rulesetId:'partial-reference-v2-lab'
    },catalog);
    tradeTrial=false;buyTrial=true;exchangeTrial=false;exchangeDraft=null;selected=[];visible=false;targetId='B';commandSerial=0;
    notice='買う研究モードです。P1が「買う」を選び、P2が応答します';
    return view();
  }
  function loadExchangeTrial(){
    state=createStagingRoom({
      seats:Object.entries(EXCHANGE_TRIAL_HANDS).map(([id,handDefinitionIds])=>({
        id,handDefinitionIds:[...handDefinitionIds]
      })),
      firstSeatId:'A',rulesetId:'partial-reference-v2-lab'
    },catalog);
    tradeTrial=false;buyTrial=false;exchangeTrial=true;exchangeDraft=null;
    selected=[];visible=false;targetId='B';commandSerial=0;
    notice='両替研究モードです。HP・MP・¥の合計を保って振り分けてください';
    return view();
  }
  function reset(){
    state=createStagingRoom({
      seats:handEntries.map(p=>({id:p.id,handDefinitionIds:[...p.handDefinitionIds]})),
      firstSeatId,rulesetId:'partial-reference-v2-lab'
    },catalog);
    tradeTrial=false;buyTrial=false;exchangeTrial=false;exchangeDraft=null;selected=[];visible=false;targetId=otherSeat(state,firstSeatId);
    notice='新しい検証試合。手番プレイヤーに渡してください';
    commandSerial=0;
    return view();
  }
  return {view,reveal,toggle,setTarget,submit,reset,loadTradeTrial,loadBuyTrial,loadExchangeTrial,
    // Test-only state snapshot: never send to another player or persist online.
    labSnapshot:()=>JSON.parse(JSON.stringify(state))};
}
