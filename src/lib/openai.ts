import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { env } from "../config/env.js";

const client = new OpenAI({ apiKey: env.openaiApiKey });

// モデル廃止時は環境変数（GitHub Variables）で上書きできる
// ※gpt-image-1は2026-10-23廃止 → gpt-image-2へ移行済み
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";

/**
 * JSONを返すチャット呼び出し。パース失敗時は1回リトライ。
 */
export async function chatJSON<T>(system: string, user: string): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await client.chat.completions.create({
      model: TEXT_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.9,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      if (attempt === 2) throw new Error(`OpenAI応答のJSONパースに失敗: ${raw.slice(0, 200)}`);
    }
  }
  throw new Error("unreachable");
}

/** 通常のテキスト生成（分析レポートなど長文用） */
export async function chatText(system: string, user: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: TEXT_MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

/**
 * Web検索付きモデルでファクトチェックを行い、修正済みJSONを返す。
 * 検索APIが使えない・失敗した場合はnullを返し、呼び出し側は元の内容で続行する（投稿を止めない）。
 */
export async function factCheckJSON<T>(system: string, user: string): Promise<T | null> {
  try {
    const res = await (client as unknown as {
      responses: { create: (p: unknown) => Promise<{ output_text?: string }> };
    }).responses.create({
      model: process.env.OPENAI_SEARCH_MODEL ?? "gpt-4.1",
      tools: [{ type: "web_search" }],
      input: `${system}\n\n${user}`,
    });
    const text = res.output_text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as T) : null;
  } catch (e) {
    console.warn(`⚠ 事実確認（Web検索）に失敗したため元の内容で続行: ${(e as Error).message}`);
    return null;
  }
}

/**
 * 画像生成して保存する。size: 縦長カルーセル用は1024x1536。
 */
export async function generateImage(prompt: string, outPath: string): Promise<void> {
  // モデル世代によってsize/qualityの指定可能値が変わるため、拒否されたらautoで再試行する
  let res;
  try {
    res = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: "1024x1536",
      quality: "medium",
      n: 1,
    });
  } catch (e) {
    console.warn(`⚠ size/quality指定が拒否されたためautoで再試行: ${(e as Error).message}`);
    res = await client.images.generate({ model: IMAGE_MODEL, prompt, n: 1 });
  }
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像生成に失敗しました（b64_jsonなし）");
  await writeFile(outPath, Buffer.from(b64, "base64"));
}
