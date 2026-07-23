export interface Category {
  id: string;
  name: string;
  /** 出現比率の重み（同タイプ内で合計100） */
  weight: number;
  /** 企画生成AIへのヒント */
  hint: string;
}

/** カルーセル（毎日12:00）カテゴリと比率 */
export const CAROUSEL_CATEGORIES: Category[] = [
  { id: "aruaru", name: "野球好き女子あるある", weight: 20, hint: "共感で保存されるあるあるネタ。観戦前日の準備、推しが打った瞬間、遠征の荷物など" },
  { id: "gourmet", name: "球場グルメ", weight: 20, hint: "球場ごとの名物グルメ・映えメニュー・値段・売店の場所。保存需要が高い" },
  { id: "oshikatsu", name: "推し活", weight: 15, hint: "推し選手の応援方法、ユニフォームコーデ、うちわ・ボード作り" },
  { id: "date", name: "球場デート", weight: 10, hint: "球場デートの楽しみ方・服装・座席選び・持ち物" },
  { id: "event", name: "球場イベント", weight: 10, hint: "花火ナイター、コラボグッズ、レディースデーなど直近の球場イベント情報" },
  { id: "beginner", name: "観戦初心者向け", weight: 8, hint: "チケットの買い方、座席の選び方、ルール入門、持ち物リスト" },
  { id: "goods", name: "応援グッズ", weight: 5, hint: "タオル・ユニフォーム・ペンライトなどグッズ紹介と使い方" },
  { id: "draft_howto", name: "Draft利用方法", weight: 4, hint: "Draftで観戦仲間を見つける流れを自然に紹介。恋愛ではなく仲間探し" },
  { id: "draft_story", name: "Draft成功体験", weight: 4, hint: "Draftで観戦仲間ができた女性のストーリー仕立て（架空でも自然に）" },
  { id: "team", name: "球団別特集", weight: 4, hint: "特定球団の魅力・本拠地球場・名物応援を特集" },
];

/** リール（毎日21:00）カテゴリと比率 */
export const REEL_CATEGORIES: Category[] = [
  { id: "vlog", name: "球場観戦Vlog風", weight: 20, hint: "入場→売店→座席→乾杯→応援の1日をスマホ撮影風に" },
  { id: "gourmet", name: "球場グルメ紹介", weight: 20, hint: "球場グルメを手に持って見せる・食べる瞬間" },
  { id: "friends", name: "女性同士の観戦", weight: 15, hint: "女友達2〜3人で観戦を楽しむ空気感" },
  { id: "oshikatsu", name: "推し活動画", weight: 15, hint: "ユニフォーム姿で応援、タオルを掲げる、うちわを振る" },
  { id: "date", name: "球場デート", weight: 10, hint: "カップルの自然な観戦デート風景" },
  { id: "homerun", name: "ホームランの盛り上がり", weight: 8, hint: "ホームラン瞬間のスタンドの熱狂・ハイタッチ" },
  { id: "draft_scene", name: "Draft利用シーン", weight: 7, hint: "Draftで出会った観戦仲間と球場で合流するシーン" },
  { id: "koryu", name: "観戦仲間との交流", weight: 5, hint: "観戦後のごはん、写真の撮り合い、仲間との交流" },
];

/** リール撮影シーン候補（プロンプトに使う球場） */
export const STADIUMS = [
  "Tokyo Dome",
  "Meiji Jingu Stadium",
  "Yokohama Stadium",
  "Es Con Field Hokkaido",
  "PayPay Dome Fukuoka",
];
