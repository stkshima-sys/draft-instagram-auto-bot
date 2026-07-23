import { todayJST } from "../config/env.js";
import { getMediaInsights, getAccountSnapshot, getAccountInsights } from "../instagram/client.js";
import {
  readRows, updateCells, ensureSheet, appendRow,
  POSTS_SHEET, POSTS_HEADER, ACCOUNT_SHEET, ACCOUNT_HEADER,
} from "../lib/sheets.js";

/**
 * 毎晩実行。
 * 1) 直近14日の投稿行の指標を更新（L列=Reach 以降）
 * 2) アカウント日次スナップショット（フォロワー数など）をAccount_Dailyに追記
 *    Followers Gained はフォロワー数の前日差分で算出
 */
export async function fetchInsights(): Promise<void> {
  await ensureSheet(POSTS_SHEET, POSTS_HEADER);
  await ensureSheet(ACCOUNT_SHEET, ACCOUNT_HEADER);

  // --- アカウントスナップショット ---
  const snap = await getAccountSnapshot();
  const acct = await getAccountInsights();
  const accountRows = await readRows(ACCOUNT_SHEET);
  const prevFollowers = accountRows.length
    ? Number(accountRows[accountRows.length - 1].values[1] ?? 0)
    : snap.followers;
  const gainedToday = snap.followers - prevFollowers;

  const today = todayJST();
  const lastDate = accountRows.at(-1)?.values[0];
  if (lastDate !== today) {
    await appendRow(ACCOUNT_SHEET, [
      today, snap.followers, snap.follows, snap.mediaCount,
      acct.profileViews, acct.websiteClicks, acct.reach,
    ]);
  }
  console.log(`📊 フォロワー: ${snap.followers}（前日比 ${gainedToday >= 0 ? "+" : ""}${gainedToday}）`);

  // --- 投稿別インサイト更新（直近14日） ---
  const rows = await readRows(POSTS_SHEET);
  const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let updated = 0;
  for (const row of rows) {
    const [date, , , , , , , , , , mediaId] = row.values;
    if (!mediaId || !date || date < cutoff) continue;
    try {
      const m = await getMediaInsights(mediaId);
      // L列(Reach)〜T列(Website Clicks)
      await updateCells(POSTS_SHEET, row.rowIndex, "L", [
        m.reach ?? 0,
        m.views ?? 0, // Impressionsは廃止傾向のためviewsを記録
        m.likes ?? 0,
        m.comments ?? 0,
        m.shares ?? 0,
        m.saved ?? 0,
        m.profile_visits ?? 0,
        m.follows ?? 0,
        acct.websiteClicks, // メディア単位では取得不可のためアカウント日次値
      ]);
      updated++;
    } catch (e) {
      console.warn(`⚠ ${date} の指標取得に失敗: ${(e as Error).message}`);
    }
  }
  console.log(`✅ ${updated}件の投稿指標を更新しました`);
}
