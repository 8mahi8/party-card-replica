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
const main=(id,referenceName,attack,price,weight,{element='none',guard,reaction}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'main',category:'weapon_single',element,attack,price,weight,...(guard===undefined?{}:{guard}),...(reaction===undefined?{}:{reaction,reactionScope:'neutral_weapon'})});
const add=(id,referenceName,attack,price,weight=1,{element='none'}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'addon',category:'weapon_single',element,attack,price,weight});
const shield=(id,referenceName,guard,price,weight,{element='none',attackBonus,stopScope}={})=>
  Object.freeze({id,referenceName,kind:'armor',category:'armor_normal',element,guard,price,weight,...(attackBonus===undefined?{}:{attackBonus}),...(stopScope===undefined?{}:{stopScope})});

/** Read-only 69-card subset. Do not normalize and sample as the full deck. */
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
  Object.freeze({id:'i001',referenceName:'虹のカーテン',kind:'defense_item',category:'item',element:'none',effect:'strip_element',price:15,weight:3}),
  Object.freeze({id:'i002',referenceName:'スーパーミラー',kind:'defense_item',category:'item',element:'none',effect:'reflect_any',price:10,weight:1}),
  Object.freeze({id:'m001',referenceName:'壁',kind:'miracle',role:'stop',stopScope:'neutral_weapon',category:'miracle',element:'none',mpCost:6,price:0,weight:1}),
  Object.freeze({id:'m002',referenceName:'氷',kind:'miracle',role:'attack',category:'miracle',element:'water',attack:4,mpCost:2,price:0,weight:1}),
  Object.freeze({id:'m003',referenceName:'闇',kind:'miracle',role:'attack',category:'miracle',element:'dark',attack:5,mpCost:5,price:0,weight:1}),
  Object.freeze({id:'m004',referenceName:'オーラ',kind:'miracle',role:'boost_weapon',boost:'double_weapon',category:'miracle',element:'none',mpCost:6,price:0,weight:1}),
  Object.freeze({id:'m005',referenceName:'火の玉',kind:'miracle',role:'attack',plusAttack:true,category:'miracle',element:'fire',attack:2,mpCost:2,price:0,weight:1}),
  Object.freeze({id:'m006',referenceName:'流星',kind:'miracle',role:'attack',plusAttack:true,category:'miracle',element:'light',attack:10,mpCost:7,price:0,weight:1}),
  Object.freeze({id:'m007',referenceName:'乱気流',kind:'miracle',role:'deflect_miracle',category:'miracle',element:'none',mpCost:5,price:0,weight:1}),
  Object.freeze({id:'i003',referenceName:'精霊のぬいぐるみ',kind:'support_item',category:'item',element:'none',effect:'free_previous_miracle',price:5,weight:2}),
]);

export function findVerifiedBasicCard(id) {
  return VERIFIED_BASIC_CARDS.find(c=>c.id===id) ?? null;
}
