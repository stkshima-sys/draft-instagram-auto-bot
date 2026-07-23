import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { env } from "../config/env.js";

const client = new OpenAI({ apiKey: env.openaiApiKey });

const TEXT_MODEL = "gpt-4.1";
const IMAGE_MODEL = "gpt-image-1";

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
 * 画像生成して保存する。size: 縦長カルーセル用は1024x1536。
 */
export async function generateImage(prompt: string, outPath: string): Promise<void> {
  const res = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1536",
    quality: "medium",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("画像生成に失敗しました（b64_jsonなし）");
  await writeFile(outPath, Buffer.from(b64, "base64"));
}
