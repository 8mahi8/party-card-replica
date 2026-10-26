/**
 * 確認済みの「特殊効果なし」神器の一部を登録した原作照合サンプル。
 * 353種類の完全なカードプールではない。これで対戦用山札を作ると
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
const main=(id,referenceName,attack,price,weight,{element='none',guard}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'main',category:'weapon_single',element,attack,price,weight,...(guard===undefined?{}:{guard})});
const add=(id,referenceName,attack,price,weight=1,{element='none'}={})=>
  Object.freeze({id,referenceName,kind:'weapon',slot:'addon',category:'weapon_single',element,attack,price,weight});
const shield=(id,referenceName,guard,price,weight,{element='none'}={})=>
  Object.freeze({id,referenceName,kind:'armor',category:'armor_normal',element,guard,price,weight});

/** Read-only 35-card subset. Do not normalize and sample as the full deck. */
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
  add('a001','吹き矢',1,1),
  add('a002','クロスボウ',2,2),
  add('a003','ブーメラン',3,3),
  add('a004','バトルボール',4,4),
  add('a005','戦士の弓',5,5),
  add('a006','ジェットヨーヨー',6,6),
  add('a007','未知の羽根',7,7),
  add('a008','サイキックカード',8,8),
  shield('d001','革の帽子',1,1,10),
  shield('d002','革の服',2,2,10),
  shield('d003','アイアンガントレット',3,3,8),
  shield('d004','アイアンシールド',4,4,8),
  shield('d005','アイアンアーマー',5,5,8),
  shield('d006','はがねの小手',6,6,6),
  shield('d007','はがねのかぶと',7,7,6),
  shield('d008','はがねの盾',8,8,6),
  shield('d009','神の盾',30,30,1),
]);

export function findVerifiedBasicCard(id) {
  return VERIFIED_BASIC_CARDS.find(c=>c.id===id) ?? null;
}
