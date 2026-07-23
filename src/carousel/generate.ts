import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAROUSEL_CATEGORIES } from "../config/categories.js";
import { todayJST } from "../config/env.js";
import { chatJSON, generateImage } from "../lib/openai.js";
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
  slides: { heading: string; body: string }[];
  caption: string;
  hashtags: string[];
  cover_image_prompt: string;
}

const SYSTEM = `あなたは日本のプロ野球好き女性(18〜30歳)向けInstagramアカウントの敏腕編集者です。
野球観戦仲間マッチングサービス「Draft」の公式アカウントとして、保存・共感されるカルーセル投稿を企画します。
恋愛マッチングではなく「観戦仲間探し」が主軸です。宣伝臭は最小限に、読者の役に立つ内容を優先します。
必ずJSONのみで回答してください。`;

export async function generateCarousel(): Promise<CarouselPlan> {
  const date = todayJST();
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
  - body: 60〜90文字。改行(\\n)で2〜3行に分ける。絵文字1〜2個OK
- title: 表紙タイトル。15〜22文字。数字や「〇選」で保存したくなる表現
- caption: 300〜600文字。共感→内容の要約→コメント誘導。自然な日本語、絵文字適度。
  最後は必ず「あなたはどれに共感しましたか？」で締める（この後にハッシュタグが付く）
- hashtags: 10個。#野球女子 #プロ野球観戦 など日本語中心、大中小の規模を混ぜる
- cover_image_prompt: 表紙背景用の英語プロンプト。
  日本の球場で楽しむ20代日本人女性のリアルなスマホ写真風。文字は入れない。
  "photorealistic, shot on smartphone, natural lighting, no text" を含める

JSON形式:
{"title": "...", "slides": [{"heading": "...", "body": "..."}], "caption": "...", "hashtags": ["#..."], "cover_image_prompt": "..."}`;

  const ai = await chatJSON<AiCarousel>(SYSTEM, user);

  // 検証
  if (!ai.slides || ai.slides.length < 4) throw new Error("スライドが4枚未満です");
  if (!ai.caption.includes("あなたはどれに共感しましたか")) {
    ai.caption = ai.caption.trimEnd() + "\n\nあなたはどれに共感しましたか？";
  }
  ai.hashtags = (ai.hashtags ?? []).slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`));

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
    await renderContent(i + 2, total, ai.slides[i].heading, ai.slides[i].body, p);
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
