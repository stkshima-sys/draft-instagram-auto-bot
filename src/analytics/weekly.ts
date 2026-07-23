import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { todayJST } from "../config/env.js";
import { readRows, POSTS_SHEET, ACCOUNT_SHEET } from "../lib/sheets.js";
import { chatText } from "../lib/openai.js";

interface PostStat {
  date: string;
  time: string;
  type: string;
  category: string;
  title: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  follows: number;
  saveRate: number; // saves / reach
}

function toStat(values: string[]): PostStat {
  const n = (i: number) => Number(values[i] ?? 0) || 0;
  const reach = n(11);
  return {
    date: values[0] ?? "",
    time: values[1] ?? "",
    type: values[2] ?? "",
    category: values[3] ?? "",
    title: values[4] ?? "",
    reach,
    views: n(12),
    likes: n(13),
    comments: n(14),
    shares: n(15),
    saves: n(16),
    follows: n(18),
    saveRate: reach > 0 ? Number(((n(16) / reach) * 100).toFixed(2)) : 0,
  };
}

/**
 * 毎週月曜実行。
 * 1) Sheetsの全投稿データを集計（リーチ/保存率/フォロワー獲得の上位、カテゴリ別、時間帯別、タイプ別）
 * 2) AIで分析レポート＋改善案10個を生成 → reports/ に保存
 * 3) 「来週の戦略」を prompts/改善方針.md に上書き → 翌日以降の投稿生成に自動反映
 */
export async function weeklyAnalysis(): Promise<void> {
  const rows = await readRows(POSTS_SHEET);
  const stats = rows.map((r) => toStat(r.values)).filter((s) => s.date);
  if (stats.length === 0) {
    console.log("⏭ 分析対象の投稿がまだありません");
    return;
  }

  const cutoff = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recent = stats.filter((s) => s.date >= cutoff);
  const week = stats.filter((s) => s.date >= new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10));

  const top = (arr: PostStat[], key: keyof PostStat) =>
    [...arr].sort((a, b) => Number(b[key]) - Number(a[key])).slice(0, 10);

  const byGroup = (arr: PostStat[], key: (s: PostStat) => string) => {
    const map = new Map<string, PostStat[]>();
    for (const s of arr) {
      const k = key(s);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].map(([k, list]) => ({
      group: k,
      count: list.length,
      avgReach: Math.round(list.reduce((x, s) => x + s.reach, 0) / list.length),
      avgSaves: Math.round(list.reduce((x, s) => x + s.saves, 0) / list.length),
      avgSaveRate: Number((list.reduce((x, s) => x + s.saveRate, 0) / list.length).toFixed(2)),
      totalFollows: list.reduce((x, s) => x + s.follows, 0),
    }));
  };

  let followerTrend = "";
  try {
    const acct = await readRows(ACCOUNT_SHEET);
    followerTrend = acct.slice(-8).map((r) => `${r.values[0]}: ${r.values[1]}人`).join("\n");
  } catch { /* Account_Daily未作成でも続行 */ }

  const summary = {
    集計期間: `直近28日（${recent.length}投稿）/ 今週（${week.length}投稿）`,
    リーチ上位10: top(recent, "reach").map((s) => `${s.date} [${s.type}/${s.category}] ${s.title} reach=${s.reach}`),
    保存率上位10: top(recent, "saveRate").map((s) => `${s.date} [${s.type}/${s.category}] ${s.title} 保存率=${s.saveRate}%`),
    フォロワー獲得上位10: top(recent, "follows").map((s) => `${s.date} [${s.type}/${s.category}] ${s.title} +${s.follows}`),
    カテゴリ別: byGroup(recent, (s) => s.category),
    タイプ別: byGroup(recent, (s) => s.type),
    時間帯別: byGroup(recent, (s) => `${s.time.slice(0, 2)}時台`),
    フォロワー推移: followerTrend,
  };

  const currentPolicy = existsSync("prompts/改善方針.md")
    ? readFileSync("prompts/改善方針.md", "utf-8") : "（初回のため無し）";

  const report = await chatText(
    `あなたはInstagramグロースの専門家です。野球観戦仲間マッチング「Draft」の公式アカウント
（ターゲット: 18〜30歳の野球好き女性、目的: プロフィールリンクからの会員登録増加）の週次分析を行います。
日本語のMarkdownで出力してください。`,
    `以下の集計データから週次分析レポートを作成してください。

# 集計データ
${JSON.stringify(summary, null, 2)}

# 現在の改善方針
${currentPolicy}

# レポート構成（この順で）
1. 今週のサマリー（数字ベース）
2. リーチ上位投稿の分析（伸びた要因）
3. 保存率上位投稿の分析
4. フォロワー獲得上位投稿の分析
5. カテゴリ分析（伸びたカテゴリ・伸びなかったカテゴリと要因）
6. 投稿時間分析
7. リール分析
8. カルーセル分析
9. 改善案（10個、優先度順、具体的に）
10. 来週の戦略と投稿テーマ案（曜日別に14投稿分）`,
  );

  const date = todayJST();
  mkdirSync("reports", { recursive: true });
  const reportPath = join("reports", `週次分析_${date}.md`);
  writeFileSync(reportPath, report, "utf-8");
  console.log(`✅ 分析レポート保存: ${reportPath}`);

  // 改善方針.md を更新（投稿生成プロンプトに自動で入る）
  const policy = await chatText(
    `あなたはInstagram運用の戦略プランナーです。分析レポートを、投稿生成AIへの指示書に変換します。
簡潔・具体的・箇条書き中心の日本語Markdownで出力してください。`,
    `以下の週次分析レポートをもとに「改善方針.md」を作成してください。
この内容は毎日の投稿生成AIのプロンプトにそのまま挿入されます。

# 構成
## 今週の戦略（3行以内）
## 伸びた要因（続けること）
## 伸びなかった要因（やめること）
## 今週の投稿テーマ案（カルーセル7本・リール7本）
## 表現・構成ルールの更新

# 分析レポート
${report}`,
  );
  writeFileSync("prompts/改善方針.md",
    `<!-- 自動生成: ${date} の週次分析より。手動で編集しても次の月曜に上書きされます -->\n\n${policy}`,
    "utf-8");
  console.log("✅ prompts/改善方針.md を更新（翌日以降の投稿に自動反映）");
}
