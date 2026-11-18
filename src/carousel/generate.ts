import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAROUSEL_CATEGORIES } from "../config/categories.js";
import { todayJST } from "../config/env.js";
import { chatJSON, factCheckJSON, generateImage } from "../lib/openai.js";
import { selectCategory, loadStrategy } from "../planner/select.js";
import { renderCover, renderContent, renderCTA } from "./render.js";

export interface CarouselPlan {
  date: string;
  category: string;
  title: string;
  slides: { heading: string; body: string }[];
  caption: string;
  hashtags: string[];
  coverImagePrompt: string;
  images: string[]; // media/ 配下の相対パス
}

interface AiCarousel {
  title: string;
  slides: { heading: string; body: string; image_prompt: string }[];
  caption: string;
  hashtags: string[];
  cover_image_prompt: string;
}

const SYSTEM = `あなたは日本のプロ野球好き女性(18〜30歳)向けInstagramアカウントの敏腕編集者です。
野球観戦仲間マッチングサービス「Draft」の公式アカウントとして、保存・共感されるカルーセル投稿を企画します。
恋愛マッチングではなく「観戦仲間探し」が主軸です。宣伝臭は最小限に、読者の役に立つ内容を優先します。

【実在性ルール（厳守）】
- 文章中で選手名・チーム名・球場名・グルメ名・イベント名に言及する場合は、実在するものだけを使う
- 架空の選手名・チーム名・成績・日程を絶対に作らない
- 実在するか確信が持てない固有名詞は使わず、「推し選手」「推し球団」のような一般表現にする
- 【検証不能情報の禁止】価格・値段は一切書かない。売店名・店舗名・座席番号・営業時間も書かない。
  場所の説明は「場内の売店で」程度にとどめる
- メニュー名は全国的に有名な定番（例: 甲子園カレー）のみ名指しOK。少しでも不確かなら
  「ご当地グルメ」「名物弁当」のようなジャンル表現にする
- 日付・期間が関わる情報（イベント・キャンペーン）は「開催されることがある」のような
  断定を避けた表現にし、「最新情報は公式サイトで」と添える

必ずJSONのみで回答してください。`;

export async function generateCarousel(): Promise<CarouselPlan | null> {
  const date = todayJST();
  // 今日すでに投稿済みなら何もしない（手動実行と定時実行の二重投稿防止）
  if (existsSync(`posted/carousel/${date}.json`)) {
    console.log(`⏭ 今日は投稿済みのため生成をスキップ: posted/carousel/${date}.json`);
    return null;
  }
  // 既に今日のキューがある場合（手動セットや再実行）は生成をスキップして上書きを防ぐ
  const existing = `queue/carousel/${date}.json`;
  if (existsSync(existing)) {
    console.log(`⏭ 今日のキューが既に存在するため生成をスキップ: ${existing}`);
    return JSON.parse(readFileSync(existing, "utf-8")) as CarouselPlan;
  }
  const category = await selectCategory(CAROUSEL_CATEGORIES, "carousel");
  const strategy = loadStrategy();

  const user = `今日のカルーセル投稿を作成してください。

# カテゴリ
${category.name}（${category.hint}）

# 運用戦略（必ず反映）
${strategy}

# 出力ルール
- slides: 本文スライド4〜6枚（表紙とCTAは別途自動生成するので含めない）
  - heading: 20文字以内の見出し
  - body: 70〜110文字。改行(\\n)は入れず、ひと続きの文章として書く（画像上での折り返しは自動）。絵文字1〜2個OK
  - image_prompt: そのスライドの内容に合った背景写真用の英語プロンプト。
    cover_image_promptと同じ制約（photorealistic/smartphone/no text/no fan signs/no logos等）を必ず含め、
    見出しの内容が伝わる構図にする。内容タイプ別の構図ルール:
    ・コーデ/服装の話 → 全身コーデが分かる構図（full-body outfit shot, casual stadium outfit,
      cap and sneakers visible, plain clothing without logos）。本文にもアイテム名を具体的に列挙する
    ・持ち物/グッズの話 → アイテムを並べた俯瞰の置き画（flat lay, top-down view of items neatly
      arranged: towel, sunscreen, portable battery, poncho etc.）。本文のアイテムと写真を一致させる
    ・グルメの話 → 食べ物が主役のクローズアップ
    ・その他 → 見出しのシーンが伝わる観戦風景
- title: 表紙タイトル。15〜22文字。数字や「〇選」で保存したくなる表現。
  絵文字・特殊記号は使わない（画像描画で文字化けするため。「！」「？」などの全角記号はOK）
- caption: 300〜600文字。共感→内容の要約→コメント誘導。自然な日本語、絵文字適度。
  最後は必ず「あなたはどれに共感しましたか？」で締める（この後にハッシュタグが付く）
- hashtags: 10個。#野球女子 #プロ野球観戦 など日本語中心、大中小の規模を混ぜる
- cover_image_prompt: 表紙背景用の英語プロンプト。
  日本の球場で楽しむ20代日本人女性のリアルなスマホ写真風。文字は入れない。
  "photorealistic, shot on smartphone, natural lighting, no text" を含める。
  さらに必ず "no fan signs, no uchiwa fans, no banners, no readable characters or names anywhere,
  no team logos or player names on clothing" を含める
  （AIが架空の選手名や文字を描き込むのを防ぐため。うちわ・ボード・ロゴ入りユニフォームは登場させない）

JSON形式:
{"title": "...", "slides": [{"heading": "...", "body": "...", "image_prompt": "..."}], "caption": "...", "hashtags": ["#..."], "cover_image_prompt": "..."}`;

  const ai = await chatJSON<AiCarousel>(SYSTEM, user);

  // 検証
  if (!ai.slides || ai.slides.length < 4) throw new Error("スライドが4枚未満です");
  if (!ai.caption.includes("あなたはどれに共感しましたか")) {
    ai.caption = ai.caption.trimEnd() + "\n\nあなたはどれに共感しましたか？";
  }
  ai.hashtags = (ai.hashtags ?? []).slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`));

  // Web検索によるファクトチェック: 固有名詞を球団・球場の公式サイトと照合し、
  // 確認できない記述は一般表現に書き換える。チェック自体が失敗した日は元の内容で続行
  const checked = await factCheckJSON<AiCarousel>(
    `あなたは日本のプロ野球に詳しいファクトチェッカーです。Web検索を使い、
与えられたInstagram投稿案に含まれる固有名詞（グルメ名・メニュー名・イベント名・施設名・球場名）が
実在するかを確認してください。球団・球場の公式サイト（例: npb.jp、各球団公式、球場公式）を最優先の根拠とします。

ルール:
- 公式または信頼できる情報源で実在確認できた固有名詞 → そのまま残す
- 確認できなかった固有名詞 → 「ご当地グルメ」「名物メニュー」のような一般表現に書き換える
- 新しい事実・価格・売店名・営業時間を追加してはいけない
- 文体・文字数の雰囲気・絵文字・改行構成は元のまま保つ
- slidesの各image_promptは一切変更せずそのまま返す
- 最後に全体をJSONのみで出力する（形式: {"title":"...","slides":[{"heading":"...","body":"...","image_prompt":"..."}],"caption":"...","hashtags":["#..."],"cover_image_prompt":"...","verified_notes":"確認結果の要約1行"}）`,
    JSON.stringify({ title: ai.title, slides: ai.slides, caption: ai.caption, hashtags: ai.hashtags, cover_image_prompt: ai.cover_image_prompt }),
  );
  if (checked && Array.isArray(checked.slides) && checked.slides.length === ai.slides.length) {
    ai.title = checked.title || ai.title;
    ai.slides = checked.slides.map((s, i) => ({ ...s, image_prompt: ai.slides[i].image_prompt }));
    ai.caption = checked.caption || ai.caption;
    console.log(`✅ 事実確認完了: ${(checked as AiCarousel & { verified_notes?: string }).verified_notes ?? "OK"}`);
    if (!ai.caption.includes("あなたはどれに共感しましたか")) {
      ai.caption = ai.caption.trimEnd() + "\n\nあなたはどれに共感しましたか？";
    }
  }

  // 画像生成: 表紙背景(AI) → 表紙/本文/CTAをレンダリング
  const dir = join("media", "carousel", date);
  mkdirSync(dir, { recursive: true });

  const bgPath = join(dir, "bg.png");
  await generateImage(ai.cover_image_prompt, bgPath);

  const images: string[] = [];
  const total = ai.slides.length + 2;

  const coverPath = join(dir, "01_cover.jpg");
  await renderCover(bgPath, ai.title, coverPath);
  images.push(coverPath);

  for (let i = 0; i < ai.slides.length; i++) {
    const p = join(dir, `${String(i + 2).padStart(2, "0")}_slide.jpg`);
    // スライドごとの背景写真を生成。失敗しても投稿自体は止めない（写真なしデザインで続行）
    let slideBg: string | undefined = join(dir, `bg_${String(i + 2).padStart(2, "0")}.png`);
    try {
      await generateImage(ai.slides[i].image_prompt || ai.cover_image_prompt, slideBg);
    } catch (e) {
      console.warn(`⚠ スライド${i + 2}の背景生成に失敗（写真なしで続行）: ${(e as Error).message}`);
      slideBg = undefined;
    }
    await renderContent(i + 2, total, ai.slides[i].heading, ai.slides[i].body, p, slideBg);
    images.push(p);
  }

  const ctaPath = join(dir, `${String(total).padStart(2, "0")}_cta.jpg`);
  await renderCTA(ctaPath);
  images.push(ctaPath);

  const plan: CarouselPlan = {
    date,
    category: category.name,
    title: ai.title,
    slides: ai.slides,
    caption: ai.caption,
    hashtags: ai.hashtags,
    coverImagePrompt: ai.cover_image_prompt,
    images: images.map((p) => p.replace(/\\/g, "/")),
  };

  mkdirSync("queue/carousel", { recursive: true });
  writeFileSync(join("queue/carousel", `${date}.json`), JSON.stringify(plan, null, 2), "utf-8");
  console.log(`✅ カルーセル生成完了: ${category.name} / ${ai.title}（${images.length}枚）`);
  return plan;
}
