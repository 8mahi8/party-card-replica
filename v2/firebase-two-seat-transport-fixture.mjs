/**
 * G6 experimental Firebase Realtime Database (compat SDK) transport.
 * Host A owns the game engine; guest B sends intent only.
 * Transport never interprets cards or damage, and sends only seat projections.
 *
 * For small friend tests, NOT production authentication or full rules.
 * Both devices must use the same existing RTDB (no auth changes required
 * by this module); operation depends on the database's current permissions.
 * Host page must remain open. No real Firebase connection is made by import.
 */
import {createLocalRoomHostFixture} from './local-room-host-fixture.mjs';

export const LAB_ROOT='godfieldV2LabRooms';
function checkCode(code){
 if(typeof code!=='string'||!/^\d{5}$/.test(code))
  throw new Error('ルーム番号は5桁の数字で入力してください');
 return code;
}
function id(value){
 if(typeof value!=='string'||!/^[a-zA-Z0-9._:-]{1,80}$/.test(value))
  throw new Error('無効な接続ID');
 return value;
}
function checkDb(db){
 if(!db||typeof db.ref!=='function')throw new Error('Firebase Database接続が必要です');
}
function callbacks(options){
 return {
  onView:typeof options.onView==='function'?options.onView:()=>{},
  onStatus:typeof options.onStatus==='function'?options.onStatus:()=>{},
  onReceipt:typeof options.onReceipt==='function'?options.onReceipt:()=>{},
  onError:typeof options.onError==='function'?options.onError:()=>{}
 };
}
function listen(target,event,handler,error,stops){
 target.on(event,handler,error);
 stops.push(()=>target.off(event,handler));
}
function clean(stops){for(const stop of stops.splice(0))stop();}
function summarizeError(err){return String(err?.message||err||'不明な通信エラー').slice(0,200);}

/** Host owns canonical game state in memory. Firebase contains projections. */
export async function createFirebaseTwoSeatHostFixture(options={}){
 const {db,code,hostId,initialState,catalog,fixtureDrawDefinitionId='d001'}=options;
 checkDb(db);checkCode(code);id(hostId);
 if(!initialState||initialState.players?.length!==2||
    initialState.players?.[0]?.id!=='A'||initialState.players?.[1]?.id!=='B')
  throw new Error('2人用A/Bの研究状態だけが使えます');
 const cb=callbacks(options),stops=[];
 const host=createLocalRoomHostFixture({initialState,catalog,fixtureDrawDefinitionId});
 const A=host.connectSeatFixture('A'),B=host.connectSeatFixture('B');
 const room=db.ref(LAB_ROOT+'/'+code);
 const entry={meta:{hostId,guestId:null,status:'waiting',version:1},
    views:{A:A.read(),B:B.read()}};
 // Atomic collision check: do not overwrite another room with the same code.
 const created=await room.transaction(current=>current===null?entry:undefined,undefined,false);
 if(!created.committed)throw new Error('ルーム番号が使用中です。別の番号を試してください');
 let closed=false,queue=Promise.resolve();
 function publish(extra={}){
  return room.update({...extra,'views/A':A.read(),'views/B':B.read()});
 }
 listen(room.child('views/A'),'value',snap=>{
  if(!closed)cb.onView(snap.val());
 },cb.onError,stops);
 listen(room.child('meta/guestId'),'value',snap=>{
  if(!closed)cb.onStatus({seat:'A',joined:!!snap.val(),roomCode:code});
 },cb.onError,stops);
 async function processGuest(message){
  if(closed||!message?.command||typeof message.command.commandId!=='string')return;
  const cmd=message.command;
  const occupant=(await room.child('meta/guestId').once('value')).val();
  if(!occupant||message.senderId!==occupant)return;
  let receipt;
  try{
   const out=B.submit(cmd);
   receipt={id:cmd.commandId,ok:true,duplicate:out.duplicate,revision:out.revision};
   await publish({'acks/B':receipt});
  }catch(error){
   receipt={id:cmd.commandId,ok:false,error:summarizeError(error)};
   await room.child('acks/B').set(receipt);
  }
 }
 listen(room.child('commands/B'),'value',snap=>{
  if(closed)return;
  const message=snap.val();
  if(!message)return;
  queue=queue.then(()=>processGuest(message)).catch(cb.onError);
 },cb.onError,stops);
 return Object.freeze({
  roomCode:code,seatId:'A',
  read:()=>A.read(),
  async submit(command){
   if(closed)throw new Error('接続は終了しています');
   const out=A.submit(command);
   const receipt={id:command.commandId,ok:true,
      duplicate:out.duplicate,revision:out.revision};
   await publish({'acks/A':receipt});
   cb.onReceipt(receipt);
   return receipt;
  },
  // If a publish failed after engine commit, re-send current projections.
  retryPublish:()=>publish(),
  close(){closed=true;clean(stops);}
 });
}

/** Guest has no engine and never reads/receives host's complete room state. */
export async function joinFirebaseTwoSeatGuestFixture(options={}){
 const {db,code,guestId}=options;
 checkDb(db);checkCode(code);id(guestId);
 const cb=callbacks(options),stops=[];
 const room=db.ref(LAB_ROOT+'/'+code);
 const meta=(await room.child('meta').once('value')).val();
 if(!meta||meta.version!==1||!meta.hostId)
  throw new Error('指定ルームが見つかりません');
 const claimed=await room.child('meta/guestId').transaction(
  current=>current===null||current===guestId?guestId:undefined,undefined,false);
 if(!claimed.committed)throw new Error('このルームには既に参加者がいます');
 let closed=false;
 listen(room.child('views/B'),'value',snap=>{
  if(!closed)cb.onView(snap.val());
 },cb.onError,stops);
 listen(room.child('acks/B'),'value',snap=>{
  if(!closed&&snap.val())cb.onReceipt(snap.val());
 },cb.onError,stops);
 listen(room.child('meta/hostId'),'value',snap=>{
  if(!closed)cb.onStatus({seat:'B',joined:!!snap.val(),roomCode:code});
 },cb.onError,stops);
 return Object.freeze({
  roomCode:code,seatId:'B',
  async submit(command){
   if(closed)throw new Error('接続は終了しています');
   if(command?.actorId!=='B')throw new Error('参加側の操作だけを送信できます');
   // One mailbox per guest: UI waits for the matching ack before sending again.
   await room.child('commands/B').set({senderId:guestId,command});
   return {sent:true,id:command.commandId};
  },
  close(){closed=true;clean(stops);}
 });
}
