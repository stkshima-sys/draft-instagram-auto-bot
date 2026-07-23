import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, todayJST } from "../config/env.js";
import type { ReelPlan } from "./generate.js";

/**
 * Replicate API経由でAI動画を生成する（任意機能）。
 * REPLICATE_API_TOKEN 未設定時はスキップし、queue内の英語プロンプトを使って
 * 手動でKling/Veo/Higgsfieldから生成 → videos/YYYY-MM-DD.mp4 に置く運用になる。
 */
export async function generateVideo(): Promise<boolean> {
  const date = todayJST();
  const queuePath = join("queue/reels", `${date}.json`);
  if (!existsSync(queuePath)) {
    console.log("⏭ 今日のリール企画がありません");
    return false;
  }
  const plan = JSON.parse(readFileSync(queuePath, "utf-8")) as ReelPlan;
  const outPath = join("videos", `${date}.mp4`);

  if (existsSync(outPath)) {
    console.log(`⏭ 動画は既に存在: ${outPath}`);
    return true;
  }
  if (!env.replicateToken) {
    console.log("⏭ REPLICATE_API_TOKEN未設定のため動画自動生成をスキップ（手動生成モード）");
    console.log(`   Kling用プロンプト:\n${plan.prompts.kling}`);
    return false;
  }

  console.log(`🎬 Replicateで動画生成開始: ${env.replicateVideoModel}`);
  const create = await fetch(
    `https://api.replicate.com/v1/models/${env.replicateVideoModel}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.replicateToken}`,
        "Content-Type": "application/json",
        Prefer: "wait=10",
      },
      body: JSON.stringify({
        input: {
          prompt: plan.prompts.kling,
          aspect_ratio: "9:16",
          duration: 10,
        },
      }),
    },
  );
  if (!create.ok) throw new Error(`Replicate起動失敗: ${create.status} ${await create.text()}`);
  let prediction = (await create.json()) as { id: string; status: string; output?: unknown; error?: string };

  // ポーリング（最大15分）
  const start = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
    if (Date.now() - start > 15 * 60 * 1000) throw new Error("動画生成タイムアウト（15分）");
    await new Promise((r) => setTimeout(r, 15_000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${env.replicateToken}` },
    });
    prediction = (await res.json()) as typeof prediction;
    console.log(`   status: ${prediction.status}`);
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`動画生成失敗: ${prediction.error ?? prediction.status}`);
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : (prediction.output as string);
  const video = await fetch(url as string);
  mkdirSync("videos", { recursive: true });
  writeFileSync(outPath, Buffer.from(await video.arrayBuffer()));
  console.log(`✅ 動画生成完了: ${outPath}`);
  return true;
}
