import { readFileSync, existsSync } from "node:fs";
import { Category } from "../config/categories.js";
import { readRows, POSTS_SHEET } from "../lib/sheets.js";

/**
 * カテゴリ選択。
 * - 設定された比率（weight）に従う重み付きランダム
 * - 直近3投稿（同タイプ）と同じカテゴリは重みを1/4に下げ、連続を避ける
 */
export async function selectCategory(categories: Category[], type: "carousel" | "reel"): Promise<Category> {
  let recent: string[] = [];
  try {
    const rows = await readRows(POSTS_SHEET);
    recent = rows
      .filter((r) => (r.values[2] ?? "").toLowerCase() === type)
      .slice(-3)
      .map((r) => r.values[3] ?? "");
  } catch {
    // シート未作成の初回などは履歴なしで続行
  }

  const weighted = categories.map((c) => ({
    c,
    w: recent.includes(c.name) ? c.weight / 4 : c.weight,
  }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { c, w } of weighted) {
    r -= w;
    if (r <= 0) return c;
  }
  return categories[0];
}

/** 投稿テーマ設定.md と 改善方針.md を読み込んで結合（企画AIのコンテキスト） */
export function loadStrategy(): string {
  const parts: string[] = [];
  for (const f of ["prompts/投稿テーマ設定.md", "prompts/改善方針.md"]) {
    if (existsSync(f)) parts.push(readFileSync(f, "utf-8"));
  }
  return parts.join("\n\n---\n\n");
}
