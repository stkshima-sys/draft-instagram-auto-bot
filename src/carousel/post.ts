import { readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { env, todayJST, nowJST } from "../config/env.js";
import {
  createCarouselItem, createCarouselContainer, waitForContainer, publish, getPermalink,
} from "../instagram/client.js";
import { ensureSheet, appendRow, POSTS_SHEET, POSTS_HEADER } from "../lib/sheets.js";
import type { CarouselPlan } from "./generate.js";

/**
 * queue/carousel/今日.json を読み、rawURL経由でInstagramにカルーセル投稿する。
 * 前提: 画像がGitHubにpush済みで MEDIA_BASE_URL から取得できること。
 */
export async function postCarousel(): Promise<void> {
  const date = todayJST();
  const queuePath = join("queue/carousel", `${date}.json`);
  if (!existsSync(queuePath)) {
    console.log(`⏭ 今日のカルーセルキューがありません: ${queuePath}`);
    return;
  }
  const plan = JSON.parse(readFileSync(queuePath, "utf-8")) as CarouselPlan;
  const caption = `${plan.caption}\n\n${plan.hashtags.join(" ")}`;

  // 子コンテナ作成（画像URLはpublicなrawURL）
  const children: string[] = [];
  for (const img of plan.images) {
    const url = `${env.mediaBaseUrl}/${img}`;
    const id = await createCarouselItem(url);
    children.push(id);
    console.log(`  子コンテナ作成: ${img}`);
  }

  const containerId = await createCarouselContainer(children, caption);
  await waitForContainer(containerId, 300);
  const mediaId = await publish(containerId);
  const permalink = await getPermalink(mediaId);
  console.log(`✅ カルーセル投稿完了: ${permalink}`);

  // Sheets記録
  await ensureSheet(POSTS_SHEET, POSTS_HEADER);
  await appendRow(POSTS_SHEET, [
    plan.date, nowJST(), "carousel", plan.category, plan.title,
    plan.caption, plan.hashtags.join(" "), plan.coverImagePrompt, "",
    permalink, mediaId,
    "", "", "", "", "", "", "", "", "",
  ]);

  // キューをpostedへ移動
  mkdirSync("posted/carousel", { recursive: true });
  renameSync(queuePath, join("posted/carousel", `${date}.json`));
}
