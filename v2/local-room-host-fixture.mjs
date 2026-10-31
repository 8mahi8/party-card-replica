/**
 * G6 PREPARATION ONLY: in-memory, same-process host/seat adapter for V2 lab.
 *
 * This is NOT an online server, an authentication layer, or a Firebase client.
 * Only trusted test/host setup code may call connectSeatFixture(seatId).
 * The resulting seat-scoped endpoint uses one authoritative room state and
 * never returns internal events, plans, or opponents' hidden hand data.
 *
 * A real transport must establish seat ownership outside this module, persist
 * the room atomically, and replace the lab-only fixed draw with a sourced deck.
 */
import {submitAndResolveFixture} from './room-transition.mjs';
import {viewStagingRoom} from './staging-room.mjs';

export function createLocalRoomHostFixture({
  initialState,catalog,fixtureDrawDefinitionId='d001'
}={}){
  if(!initialState||initialState.schemaVersion!==2||
      !Array.isArray(initialState.players)||
      !Array.isArray(initialState.processedCommands))
    throw new Error('V2 lab state required');
  if(!(catalog instanceof Map)||!catalog.has(fixtureDrawDefinitionId))
    throw new Error('Valid lab card catalog and fixed draw required');
  // A host owns its own JSON-only room snapshot. Mutating the setup fixture
  // after creation cannot silently change an already running match.
  let state=JSON.parse(JSON.stringify(initialState));

  function connectSeatFixture(seatId){
    if(typeof seatId!=='string'||!state.players.some(p=>p.id===seatId))
      throw new Error('Unknown test seat');
    // The binding is established by trusted setup code, not a field supplied
    // by a player in a command. Exposing this factory to clients would let
    // them request somebody else's seat; it is NOT a real login mechanism.
    return Object.freeze({
      read(){
        return viewStagingRoom(state,seatId,catalog);
      },
      submit(command){
        // The original input's actorId and revision are checked by G2; the
        // authenticated seat in this fixture comes from this closure.
        // No state is committed when the resolver throws.
        const result=submitAndResolveFixture(state,command,catalog,{
          authorizedSeatId:seatId,labOnly:true,fixtureDrawDefinitionId
        });
        state=result.state;
        return Object.freeze({
          applied:result.applied,
          duplicate:result.duplicate,
          revision:state.revision,
          view:viewStagingRoom(state,seatId,catalog)
        });
      }
    });
  }
  return Object.freeze({connectSeatFixture});
}
