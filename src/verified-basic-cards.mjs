/**
 * 資料照合したカードの一部を登録した原作照合サンプル。
 * この資料上の対象版の353種類を網羅したカードプールではない。これで対戦用山札を作ると
 * 確率が原作からズレるため、公開版の抽選には絶対に使わないこと。
 *
 * 出典:
 * https://w.atwiki.jp/piong/pages/15.html
 * https://w.atwiki.jp/piong/pages/17.html
 * https://macarongamemo.com/entry/godfield-artifact (2026-02-28)
 *
 * weight は「500分母あたりの枠数」(0.2%=1)。カード名は
 * 調査用の参照名で、オリジナルUIの表示素材ではない。
 */
export const PARTIAL_CARD_SOURCE = 'piong-atwiki-and-macaron-2026-02-28';
const main=(id,referenceName,attack,price,weight,{element='none',guard,reaction,reactionScope='neutral_weapon',stopScope,hpAbsorb}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'main',category:'weapon_single',element,attack,price,weight,...(guard===undefined?{}:{guard}),...(reaction===undefined?{}:{reaction,reactionScope}),...(stopScope===undefined?{}:{stopScope}),...(hpAbsorb===undefined?{}:{hpAbsorb})});
const add=(id,referenceName,attack,price,weight=1,{element='none',reaction,reactionScope,stopScope,attackElementOverride}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'addon',category:'weapon_single',element,attack,price,weight,...(reaction===undefined?{}:{reaction,reactionScope}),...(stopScope===undefined?{}:{stopScope}),...(attackElementOverride===undefined?{}:{attackElementOverride})});
const shield=(id,referenceName,guard,price,weight,{element='none',attackBonus,stopScope,reaction,reactionScope}={})=>
  Object.freeze({id,referenceName,kind:'armor',category:'armor_normal',element,guard,price,weight,...(attackBonus===undefined?{}:{attackBonus}),...(stopScope===undefined?{}:{stopScope}),...(reaction===undefined?{}:{reaction,reactionScope})});

/** Read-only PARTIAL source-backed subset. Do not normalize and sample as the full deck. */
export const VERIFIED_BASIC_CARDS = Object.freeze([
  main('w001','銅のこん棒',1,1,3),
  main('w002','銀のこん棒',1,10,1),
  main('w003','金のこん棒',1,25,1),
  main('w004','ムチ',2,1,4),
  main('w005','セイバーロッド',2,10,1,{guard:6}),
  main('w006','パンチ',3,1,5),
  main('w007','ハチェット',4,2,6),
  main('w008','とげベルト',4,3,1,{guard:2}),
  main('w009','鎖ガマ',5,2,7),
  main('w010','打撃の鉄板',5,3,1,{guard:7}),
  main('w011','硬いつち',6,2,8),
  main('w012','エルボーサック',6,3,1,{guard:3}),
  main('w013','なぎなたクラシック',7,3,8),
  main('w014','ファイナル牙',8,3,8),
  main('w015','パワーハルベルト',9,3,7),
  main('w016','ワンダーソード',10,4,7),
  main('w017','神の剣',30,30,1),
  main('w018','たいまつ',1,1,1,{element:'fire'}),
  main('w019','ソードシールド',10,15,1,{guard:10}),
  main('w020','ほむら巻き',4,8,1,{element:'fire',guard:4}),
  main('w021','つらら',1,1,1,{element:'water'}),
  main('w022','木刀',1,1,1,{element:'wood'}),
  main('w023','つるぎ焼き',2,2,1,{element:'earth'}),
  main('w024','スタースタッフ',3,3,1,{element:'light'}),
  main('w025','ちくりんちょ',1,10,1,{element:'dark'}),
  main('w026','乱弾武剣',5,10,7,{reaction:'deflect'}),
  main('w027','反射剣',10,5,3,{reaction:'reflect'}),
  main('w028','月光のオノ',10,10,1,{reaction:'reflect',reactionScope:'miracle'}),
  main('w029','エンゼルナイフ',11,15,1,{stopScope:'miracle'}),
  main('w030','エンゼルソード',13,15,1,{stopScope:'miracle'}),
  main('w031','エンゼルアクス',15,15,1,{stopScope:'miracle'}),
  // 2026 Piong and Macaron independently identify full-attack HP absorption.
  // Special on-hit timing is handled by the common V2 effect runner.
  main('w048','ゴーストソード',7,10,1,{hpAbsorb:true}),
  main('w049','リアルゴーストソード',12,15,1,{hpAbsorb:true}),
  // Source-checked plain weapons (2026-03-18 piong wiki, cross-checked with
  // 2024 GFGA where both agree). No special/condition/status behavior.
  // Preserve main/add factories so later cards need data, not name branches.
  main('w032','グラビティメイス',11,4,4),
  main('w033','もろぶっこみアクス',12,4,4),
  main('w034','絶景のヤリ',13,5,4),
  main('w035','暴れフレイル',14,5,3),
  main('w036','ドラゴンクロウ',15,5,3),
  main('w037','あちちナイフ',2,2,1,{element:'fire'}),
  main('w038','燃えムチ',3,3,1,{element:'fire'}),
  main('w039','ブレイズブレイド',5,5,1,{element:'fire'}),
  main('w040','火竜一角',8,10,1,{element:'fire'}),
  main('w041','氷結ハンマー',4,4,1,{element:'water'}),
  main('w042','水竜一角',8,10,1,{element:'water'}),
  main('w043','いばらのムチ',2,2,1,{element:'wood'}),
  main('w044','いがナッツ',3,3,1,{element:'wood'}),
  main('w045','ダイヤモンドソード',13,25,1,{element:'earth'}),
  main('w046','ジャスティスランス',5,5,1,{element:'light'}),
  main('w047','聖剣',9,15,1,{element:'light'}),
  add('a001','吹き矢',1,1),
  add('a002','クロスボウ',2,2),
  add('a003','ブーメラン',3,3),
  add('a004','バトルボール',4,4),
  add('a005','戦士の弓',5,5),
  add('a006','ジェットヨーヨー',6,6),
  add('a007','未知の羽根',7,7),
  add('a008','サイキックカード',8,8),
  add('a009','ファイヤークロスボウ',4,8,1,{element:'fire'}),
  add('a010','輝きのカケラ',1,10,1,{element:'light'}),
  add('a011','冥矢',5,15,1,{element:'dark'}),
  add('a012','スカイハープーン',9,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  add('a013','エンゼルの弓',15,15,1,{stopScope:'miracle'}),
  add('a014','魔水のワンド',5,15,1,{element:'water',attackElementOverride:'water'}),
  add('a015','発火のワンド',2,15,1,{element:'fire',attackElementOverride:'fire'}),
  // Source-checked plain additive weapons; no special effects implied.
  add('a016','恐怖の車輪',11,10,1),
  add('a017','独楽コンバット',13,10,1),
  add('a018','葉っぱ手裏剣',2,3,1,{element:'wood'}),
  add('a019','熟成ゴムの弓',3,6,1,{element:'wood'}),
  add('a020','旧石器ジャベリン',5,4,1,{element:'earth'}),
  add('a021','新石器トマホーク',7,10,1,{element:'earth'}),
  shield('d001','革の帽子',1,1,10),
  shield('d002','革の服',2,2,10),
  shield('d003','アイアンガントレット',3,3,8),
  shield('d004','アイアンシールド',4,4,8),
  shield('d005','アイアンアーマー',5,5,8),
  shield('d006','はがねの小手',6,6,6),
  shield('d007','はがねのかぶと',7,7,6),
  shield('d008','はがねの盾',8,8,6),
  shield('d009','神の盾',30,30,1),
  shield('d010','鬼のくつ',3,10,1,{attackBonus:5}),
  shield('d011','鬼の小手',5,15,1,{attackBonus:10}),
  shield('d012','鬼のかぶと',7,15,1,{attackBonus:10}),
  shield('d013','鬼のよろい',9,20,1,{attackBonus:15}),
  shield('d014','フレイムブーツ',3,6,1,{element:'fire'}),
  shield('d015','アイスブーツ',3,6,1,{element:'water'}),
  shield('d016','森の盾',6,10,1,{element:'wood'}),
  shield('d017','石版',1,2,1,{element:'earth'}),
  shield('d018','エンゼルの小手',9,15,1,{stopScope:'miracle'}),
  shield('d019','エンゼルの帽子',11,15,1,{stopScope:'miracle'}),
  shield('d020','エンゼルシールド',13,15,1,{stopScope:'miracle'}),
  shield('d021','エンゼルアーマー',15,15,1,{stopScope:'miracle'}),
  shield('d022','スカイブーツ',1,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  shield('d023','スカイガントレット',3,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  shield('d024','スカイヘルム',5,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  shield('d025','スカイシールド',7,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  shield('d026','スカイアーマー',9,5,1,{reaction:'deflect',reactionScope:'miracle'}),
  shield('d027','月光のかぶと',8,10,1,{reaction:'reflect',reactionScope:'miracle'}),
  shield('d028','月光の盾',10,10,1,{reaction:'reflect',reactionScope:'miracle'}),
  shield('d029','月光のよろい',12,10,1,{reaction:'reflect',reactionScope:'miracle'}),
  Object.freeze({id:'i001',referenceName:'虹のカーテン',kind:'defense_item',category:'item',element:'none',effect:'strip_element',price:15,weight:3}),
  Object.freeze({id:'i002',referenceName:'スーパーミラー',kind:'defense_item',category:'item',element:'none',effect:'reflect_any',price:10,weight:1}),
  Object.freeze({id:'m001',referenceName:'壁',kind:'miracle',role:'stop',stopScope:'neutral_weapon',category:'miracle',element:'none',mpCost:6,price:0,weight:1}),
  Object.freeze({id:'m002',referenceName:'氷',kind:'miracle',role:'attack',category:'miracle',element:'water',attack:4,mpCost:2,price:0,weight:1}),
  Object.freeze({id:'m003',referenceName:'闇',kind:'miracle',role:'attack',category:'miracle',element:'dark',attack:5,mpCost:5,price:0,weight:1}),
  Object.freeze({id:'m004',referenceName:'オーラ',kind:'miracle',role:'boost_weapon',boost:'double_weapon',category:'miracle',element:'none',mpCost:6,price:0,weight:1}),
  Object.freeze({id:'m005',referenceName:'火の玉',kind:'miracle',role:'attack',plusAttack:true,category:'miracle',element:'fire',attack:2,mpCost:2,price:0,weight:1}),
  Object.freeze({id:'m006',referenceName:'流星',kind:'miracle',role:'attack',plusAttack:true,category:'miracle',element:'light',attack:10,mpCost:7,price:0,weight:1}),
  Object.freeze({id:'m007',referenceName:'乱気流',kind:'miracle',role:'deflect_miracle',category:'miracle',element:'none',mpCost:5,price:0,weight:1}),
  Object.freeze({id:'m008',referenceName:'炎',kind:'miracle',role:'attack',category:'miracle',element:'fire',attack:10,mpCost:5,price:0,weight:1}),
  Object.freeze({id:'m009',referenceName:'大木',kind:'miracle',role:'attack',category:'miracle',element:'wood',attack:6,mpCost:3,price:0,weight:1}),
  Object.freeze({id:'m010',referenceName:'岩',kind:'miracle',role:'attack',category:'miracle',element:'earth',attack:8,mpCost:4,price:0,weight:1}),
  Object.freeze({id:'m011',referenceName:'滝',kind:'miracle',role:'attack',category:'miracle',element:'water',attack:25,mpCost:12,price:0,weight:1}),
  Object.freeze({id:'i003',referenceName:'精霊のぬいぐるみ',kind:'support_item',category:'item',element:'none',effect:'free_previous_miracle',price:5,weight:2}),
  Object.freeze({id:'i004',referenceName:'ちからの粉',kind:'support_item',category:'item',element:'none',effect:'add_attack',attackBonus:10,price:15,weight:2}),
  // Passive: held charm consumes ONE instance at HP0, revives at HP10.
  // Source: https://w.atwiki.jp/piong/pages/19.html; 0.2% = 1/500.
  Object.freeze({id:'i005',referenceName:'太陽のお守り',kind:'support_item',category:'item',element:'none',effect:'sun_revive',discardPolicy:'forbidden',price:10,weight:1}),
  // Source-backed trade reference: 4% of the 500-slot reference pool.
  // This is *not* approval to use the incomplete pool for live draws.
  Object.freeze({id:'t001',referenceName:'売る',kind:'trade',category:'trade',element:'none',tradeAction:'sell',price:5,weight:20}),
  // Godfield trade list: 買う is ¥5 and 20 / 500 source slots.
  // The complete deck and mirror timing remain unverified.
  Object.freeze({id:'t002',referenceName:'買う',kind:'trade',category:'trade',element:'none',tradeAction:'buy',price:5,weight:20}),
  // Source-backed 1:1 resource reallocation, ¥5 / 20 out of 500 slots.
  Object.freeze({id:'t003',referenceName:'両替',kind:'trade',category:'trade',element:'none',tradeAction:'exchange',price:5,weight:20}),
]);

export function findVerifiedBasicCard(id) {
  return VERIFIED_BASIC_CARDS.find(c=>c.id===id) ?? null;
}
