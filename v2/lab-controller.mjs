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

function safeMessage(error){
  const msg=error?.message;
  return typeof msg==='string' && msg.length<=230 ? msg : 'この操作は現在の実験版では使えません';
}
function otherSeat(state,actor){
  return state.players.find(p=>p.id!==actor)?.id??null;
}
function keyOf(item){
  return item?.instanceId ? 'h:'+item.instanceId
    : item?.learnedDefinitionId ? 'l:'+item.learnedDefinitionId : null;
}
function baseLabel(def){
  if(!def)return '未登録';
  const stat=def.stats;
  return [
    names.get(def.id)??def.id,
    stat.attack ? '攻'+stat.attack : '',
    stat.guard ? '守'+stat.guard : '',
    stat.mpCost ? 'MP'+stat.mpCost : ''
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
      cardSetComplete:summary.complete,
      cardSetCount:summary.unique
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
        selectedOrder:selected.findIndex(x=>x.instanceId===card.instanceId)+1};
    });
    const learned=self.learned.map(id=>{
      const def=catalog.get(id);
      return {definitionId:id,label:baseLabel(def),
        family:def?.family??'unknown',
        selectedOrder:selected.findIndex(x=>x.learnedDefinitionId===id)+1};
    });
    return {...status,publicPlayers:projected.players.map(p=>({
      id:p.id,hp:p.hp,mp:p.mp,money:p.money,handCount:p.handCount
    })),
      pending:projected.pending,
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
    if(selected.length>=18)throw new Error('一度に選択できるカード数を超えました');
    if(selection.instanceId){
      const held=player.hand.find(card=>card.instanceId===selection.instanceId);
      if(!held)throw new Error('そのカードは現在の手札にありません');
      if(state.phase==='defense' && selected.some(x=>x.learnedDefinitionId)){
        const def=catalog.get(held.definitionId);
        if(!def?.playModes.includes('support'))
          throw new Error('習得済み防御奇跡の後には補助雑貨のみ選べます');
      }
    } else {
      if(!player.learned.includes(selection.learnedDefinitionId))
        throw new Error('その奇跡は習得していません');
      if(state.phase==='defense' &&
        (!catalog.get(selection.learnedDefinitionId)?.playModes.includes('defend')||
         selected.some(x=>x.learnedDefinitionId)))
        throw new Error('防御奇跡を1つだけ選択してください');
    }
    selected.push({...selection});
    return view();
  }
  function setTarget(id){
    if(!visible||state.phase!=='turn')throw new Error('攻撃ターゲットは手番中のみ指定できます');
    if(!state.players.some(p=>p.id===id&&p.hp>0))
      throw new Error('攻撃先が無効です');
    targetId=id;return view();
  }
  function submit(){
    if(!visible)throw new Error('手札表示後に操作してください');
    const actor=own();
    if(!actor)throw new Error('試合は終了しました');
    const n='lab-'+(++commandSerial);
    let command;
    if(state.phase==='defense'){
      const learned=selected.filter(x=>x.learnedDefinitionId);
      if(learned.length>1)throw new Error('習得済み防御奇跡は1つまで');
      command=learned.length
        ?{commandId:n,expectedRevision:state.revision,actorId:actor.id,
          type:'defendSequence',orderedPlays:[...selected]}
        :{commandId:n,expectedRevision:state.revision,actorId:actor.id,type:'defend',
          orderedInstanceIds:selected.filter(x=>x.instanceId).map(x=>x.instanceId)};
    } else if(state.phase==='turn'){
      if(!selected.length)throw new Error('使用するカードを選んでください');
      if(selected.length===1&&selected[0].learnedDefinitionId){
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
      selected=[];
      visible=false;
      targetId=state.phase==='turn'?otherSeat(state,state.activePlayerId):null;
      notice=state.phase==='finished'?'検証試合が終了しました':
        result.state.phase==='defense'?'防御するプレイヤーに端末を渡してください':
          '手番が進みました。次のプレイヤーに渡してください';
      return {ok:true,view:view(),events:result.events.map(x=>({type:x.type})),
        changedRevision:state.revision};
    } catch(error){
      // Caller sees only the reason for failure, never an applied partial state.
      notice=safeMessage(error);
      return {ok:false,error:notice,view:view(),changedRevision:state.revision};
    }
  }
  function reset(){
    state=createStagingRoom({
      seats:handEntries.map(p=>({id:p.id,handDefinitionIds:[...p.handDefinitionIds]})),
      firstSeatId,rulesetId:'partial-reference-v2-lab'
    },catalog);
    selected=[];visible=false;targetId=otherSeat(state,firstSeatId);
    notice='新しい検証試合。手番プレイヤーに渡してください';
    commandSerial=0;
    return view();
  }
  return {view,reveal,toggle,setTarget,submit,reset,
    // Test-only state snapshot: never send to another player or persist online.
    labSnapshot:()=>JSON.parse(JSON.stringify(state))};
}
