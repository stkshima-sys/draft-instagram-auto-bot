import { readFileSync, existsSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { env, nowJST } from "../config/env.js";
import { createReelContainer, waitForContainer, publish, getPermalink } from "../instagram/client.js";
import { ensureSheet, appendRow, POSTS_SHEET, POSTS_HEADER } from "../lib/sheets.js";
import type { ReelPlan } from "./generate.js";

/**
 * queue/reels/ の中で「動画ファイルが存在する最も古い企画」を投稿する。
 * 動画がまだ無い企画はスキップされ、後日動画が置かれた時点で投稿される。
 */
export async function postReel(): Promise<void> {
  if (!existsSync("queue/reels")) {
    console.log("⏭ リールキューがありません");
    return;
  }
  const queued = readdirSync("queue/reels").filter((f) => f.endsWith(".json")).sort();
  let target: { path: string; plan: ReelPlan } | null = null;
  for (const f of queued) {
    const plan = JSON.parse(readFileSync(join("queue/reels", f), "utf-8")) as ReelPlan;
    if (existsSync(plan.videoFile)) {
      target = { path: join("queue/reels", f), plan };
      break;
    }
  }
  if (!target) {
    console.log("⏭ 投稿可能な動画がありません（videos/に動画未配置）。今日は投稿スキップ");
    return;
  }

  const { plan } = target;
  const caption = `${plan.caption}\n\n${plan.hashtags.join(" ")}`;
  const videoUrl = `${env.mediaBaseUrl}/${plan.videoFile.replace(/\\/g, "/")}`;

  console.log(`🎬 リール投稿開始: ${plan.title}`);
  const containerId = await createReelContainer(videoUrl, caption);
  await waitForContainer(containerId, 600);
  const mediaId = await publish(containerId);
  const permalink = await getPermalink(mediaId);
  console.log(`✅ リール投稿完了: ${permalink}`);

  await ensureSheet(POSTS_SHEET, POSTS_HEADER);
  await appendRow(POSTS_SHEET, [
    plan.date, nowJST(), "reel", plan.category, plan.title,
    plan.caption, plan.hashtags.join(" "), "", plan.prompts.kling,
    permalink, mediaId,
    "", "", "", "", "", "", "", "", "",
  ]);

  mkdirSync("posted/reels", { recursive: true });
  renameSync(target.path, join("posted/reels", `${plan.date}.json`));
}
