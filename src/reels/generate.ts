import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REEL_CATEGORIES, STADIUMS } from "../config/categories.js";
import { todayJST } from "../config/env.js";
import { chatJSON } from "../lib/openai.js";
import { selectCategory, loadStrategy } from "../planner/select.js";

export interface ReelPlan {
  date: string;
  category: string;
  title: string;
  scene: string;
  caption: string;
  hashtags: string[];
  prompts: { kling: string; veo: string; higgsfield: string };
  videoFile: string; // videos/YYYY-MM-DD.mp4
}

interface AiReel {
  title: string;
  scene_description: string;
  caption: string;
  hashtags: string[];
  kling_prompt: string;
  veo_prompt: string;
  higgsfield_prompt: string;
}

const SYSTEM = `あなたは日本のプロ野球好き女性(18〜30歳)向けInstagramリールのクリエイティブディレクター兼、
AI動画生成プロンプトのエキスパートです。
野球観戦仲間マッチング「Draft」の公式アカウント用に、AI感のないリアルなスマホ撮影風リールを企画します。
必ずJSONのみで回答してください。`;

export async function generateReel(): Promise<ReelPlan> {
  const date = todayJST();
  const category = await selectCategory(REEL_CATEGORIES, "reel");
  const strategy = loadStrategy();
  const stadium = STADIUMS[Math.floor(Math.random() * STADIUMS.length)];

  const user = `今日のリール動画を企画してください。

# カテゴリ
${category.name}（${category.hint}）

# 舞台
${stadium}

# 運用戦略（必ず反映）
${strategy}

# 動画の条件
- 10〜15秒、縦型9:16
- リアル・自然・スマホ撮影風・AI感なし
- 登場人物: 20代日本人女性（1〜3人）。笑顔、乾杯、応援、球場グルメ、推し活など
- 球場の観客席・コンコース・売店などのシーン

# 出力ルール
- title: 企画タイトル（日本語、管理用）
- scene_description: 映像の流れを日本語で3行
- caption: 300〜600文字の日本語キャプション。共感重視、コメント誘導。
  最後は必ず「あなたはどれに共感しましたか？」で締める
- hashtags: 10個
- kling_prompt / veo_prompt / higgsfield_prompt: 各AIに最適化した英語プロンプト
  - 共通: vertical 9:16, 10-15s, photorealistic, smartphone-shot look, natural handheld motion,
    Japanese women in their 20s at a Japanese baseball stadium, no text overlays, no AI artifacts
  - Kling: 具体的な被写体・動き・カメラワークを1段落で
  - Veo: シーン構成をカット割り（0-5s / 5-10s / 10-15s）で
  - Higgsfield: カメラモーション指定（handheld, pan, push-inなど）を明示

JSON形式:
{"title":"...","scene_description":"...","caption":"...","hashtags":["#..."],"kling_prompt":"...","veo_prompt":"...","higgsfield_prompt":"..."}`;

  const ai = await chatJSON<AiReel>(SYSTEM, user);

  if (!ai.caption.includes("あなたはどれに共感しましたか")) {
    ai.caption = ai.caption.trimEnd() + "\n\nあなたはどれに共感しましたか？";
  }
  ai.hashtags = (ai.hashtags ?? []).slice(0, 10).map((h) => (h.startsWith("#") ? h : `#${h}`));

  const plan: ReelPlan = {
    date,
    category: category.name,
    title: ai.title,
    scene: ai.scene_description,
    caption: ai.caption,
    hashtags: ai.hashtags,
    prompts: {
      kling: ai.kling_prompt,
      veo: ai.veo_prompt,
      higgsfield: ai.higgsfield_prompt,
    },
    videoFile: `videos/${date}.mp4`,
  };

  mkdirSync("queue/reels", { recursive: true });
  writeFileSync(join("queue/reels", `${date}.json`), JSON.stringify(plan, null, 2), "utf-8");
  console.log(`✅ リール企画完了: ${category.name} / ${ai.title}`);
  return plan;
}
