import sharp from "sharp";
import { existsSync } from "node:fs";

/**
 * カルーセル画像レンダリング（1080x1350）
 * - 表紙: AI生成写真の上に半透明パネル＋タイトル
 * - 本文: ブランドグラデーション背景＋見出し・本文
 * - CTA:  ブランド背景＋Draft誘導
 * 日本語テキストはSVG合成で載せる（AI画像の文字化け回避）。
 * GitHub Actionsでは fonts-noto-cjk をインストールして使う。
 */

const W = 1080;
const H = 1350;
const FONT = "Noto Sans CJK JP, Noto Sans JP, sans-serif";

// Draftブランドカラー（女性向けに柔らかいトーン）
// Draftアプリアイコンの配色（シアン#22e0f0〜ブルー#21b5e7〜ミント#76d6c4）に合わせたブランドカラー
const BRAND_BLUE = "#1ba6dc";
const BRAND_CYAN = "#22d6ec";
const BRAND_MINT = "#4fd8c4";
const DARK = "#0d4c63"; // 文字・パネル用の濃いブルーグリーン
const NAVY = DARK;
const PINK = BRAND_BLUE;
const CREAM = "#f5fcfe";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 全角基準でテキストを折り返す。
 * - 英単語・数字の連続（例: Draft, 2026）は1トークンとして扱い、行をまたいで分割しない
 * - 行頭に句読点・閉じ括弧が来ないようにする（禁則処理）
 * - 行長を均等化して「まと／め」のような1文字残りを避ける
 */
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    // ASCII英数字の連続は1トークン、それ以外は1文字ずつ
    const tokens = para.match(/[A-Za-z0-9#&%+._-]+|\S|\s/gu) ?? [];
    if (tokens.length === 0) { out.push(""); continue; }
    // 半角は0.55文字幅として計算
    const width = (t: string) => [...t].reduce((s, c) => s + (/[ -~]/.test(c) ? 0.55 : 1), 0);
    const total = tokens.reduce((s, t) => s + width(t), 0);
    const lineCount = Math.max(1, Math.ceil(total / maxChars));
    const target = total / lineCount;

    const lines: string[] = [];
    let cur = "";
    let curW = 0;
    const noBreakBefore = /^[、。！？!?…ー」』）〉》”’]/;
    for (const t of tokens) {
      const tw = width(t);
      const shouldBreak =
        cur !== "" &&
        curW + tw > target + 0.3 &&
        lines.length < lineCount - 1 &&
        !noBreakBefore.test(t);
      if (shouldBreak) {
        lines.push(cur);
        cur = "";
        curW = 0;
      }
      cur += t;
      curW += tw;
    }
    if (cur) lines.push(cur);
    out.push(...lines.map((l) => l.trim()));
  }
  return out;
}

function tspans(lines: string[], x: number, startY: number, lineH: number): string {
  return lines
    .map((l, i) => `<tspan x="${x}" y="${startY + i * lineH}">${esc(l)}</tspan>`)
    .join("");
}

/** 表紙: AI背景写真 + 半透明パネル + タイトル */
export async function renderCover(bgPath: string, title: string, outPath: string): Promise<void> {
  const titleLines = wrap(title, 10);
  const panelH = 180 + titleLines.length * 110;
  const panelY = H - panelH - 140;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="60" y="${panelY}" width="${W - 120}" height="${panelH}" rx="32" fill="${NAVY}" opacity="0.82"/>
    <text font-family="${FONT}" font-size="88" font-weight="bold" fill="#ffffff" text-anchor="middle">
      ${tspans(titleLines, W / 2, panelY + 150, 110)}
    </text>
    <text x="${W / 2}" y="${panelY + panelH - 36}" font-family="${FONT}" font-size="40" fill="${BRAND_CYAN}" text-anchor="middle">保存して球場で見返してね ▶</text>
  </svg>`;

  const base = existsSync(bgPath)
    ? sharp(bgPath).resize(W, H, { fit: "cover" })
    : sharp({ create: { width: W, height: H, channels: 3, background: NAVY } });

  await base.composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toFile(outPath);
}

/**
 * 本文スライド。
 * bgPathに写真があれば「写真背景＋濃色パネル＋白文字」、無ければ従来の淡色デザインで描く。
 */
export async function renderContent(
  index: number,
  total: number,
  heading: string,
  body: string,
  outPath: string,
  bgPath?: string,
): Promise<void> {
  const headLines = wrap(heading, 12);
  const bodyLines = body.split("\n").flatMap((p) => wrap(p, 16));

  if (bgPath && existsSync(bgPath)) {
    // 写真背景版: パネルの左端から右端まで文字で使い切る。
    // 行の文字量に合わせてフォントサイズを自動調整し、枠幅いっぱいに表示する
    const padX = 130;
    const usable = W - padX * 2; // パネル内の文字領域幅
    const units = (l: string) => [...l].reduce((s, c) => s + (/[ -~]/.test(c) ? 0.55 : 1), 0);

    const hLines = wrap(heading, 11);
    const headFont = Math.min(84, Math.floor(usable / Math.max(...hLines.map(units), 6)));
    const headLH = Math.round(headFont * 1.3);
    const bLines = body.split("\n").flatMap((p) => wrap(p, 15));
    const bodyFont = Math.min(60, Math.floor(usable / Math.max(...bLines.map(units), 8)));
    const bodyLH = Math.round(bodyFont * 1.62);

    const pgY0 = 90;
    const headY0 = pgY0 + 30 + headLH;
    const underY0 = headY0 + (hLines.length - 1) * headLH + 45;
    const bodyY0 = underY0 + 55 + bodyFont;
    const panelH = bodyY0 + (bLines.length - 1) * bodyLH + 70;
    const panelY = Math.max(110, Math.round((H - panelH) / 2));
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#000000" opacity="0.18"/>
      <rect x="70" y="${panelY}" width="${W - 140}" height="${panelH}" rx="32" fill="${DARK}" opacity="0.85"/>
      <text x="${padX}" y="${panelY + pgY0}" font-family="${FONT}" font-size="44" font-weight="bold" fill="${BRAND_CYAN}">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
      <text font-family="${FONT}" font-size="${headFont}" font-weight="bold" fill="#ffffff">
        ${tspans(hLines, padX, panelY + headY0, headLH)}
      </text>
      <rect x="${padX}" y="${panelY + underY0}" width="${usable}" height="8" rx="4" fill="${BRAND_CYAN}" opacity="0.9"/>
      <text font-family="${FONT}" font-size="${bodyFont}" fill="#eafcff">
        ${tspans(bLines, padX, panelY + bodyY0, bodyLH)}
      </text>
      <text x="${W / 2}" y="${H - 60}" font-family="${FONT}" font-size="36" fill="#ffffff" opacity="0.85" text-anchor="middle">Draft ｜ 野球観戦仲間マッチング</text>
    </svg>`;
    await sharp(bgPath)
      .resize(W, H, { fit: "cover" })
      .composite([{ input: Buffer.from(svg) }])
      .jpeg({ quality: 90 })
      .toFile(outPath);
    return;
  }

  // 従来版（写真なしフォールバック）
  const headY = 300;
  const bodyY = headY + headLines.length * 96 + 90;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${CREAM}"/>
        <stop offset="1" stop-color="#e2f5fb"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <text x="90" y="160" font-family="${FONT}" font-size="44" font-weight="bold" fill="${PINK}">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</text>
    <rect x="90" y="${headY - 70}" width="14" height="${headLines.length * 96}" rx="7" fill="${PINK}"/>
    <text font-family="${FONT}" font-size="72" font-weight="bold" fill="${NAVY}">
      ${tspans(headLines, 140, headY, 96)}
    </text>
    <text font-family="${FONT}" font-size="52" fill="#3a3a3a">
      ${tspans(bodyLines, 90, bodyY, 84)}
    </text>
    <text x="${W / 2}" y="${H - 80}" font-family="${FONT}" font-size="36" fill="#8fb5c2" text-anchor="middle">Draft ｜ 野球観戦仲間マッチング</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(outPath);
}

/** 最終CTAスライド */
export async function renderCTA(outPath: string): Promise<void> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND_CYAN}"/>
        <stop offset="0.55" stop-color="${BRAND_BLUE}"/>
        <stop offset="1" stop-color="${BRAND_MINT}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <text x="${W / 2}" y="430" font-family="${FONT}" font-size="64" fill="#ffffff" text-anchor="middle">観戦仲間を探すなら</text>
    <text x="${W / 2}" y="620" font-family="${FONT}" font-size="150" font-weight="bold" fill="#ffffff" text-anchor="middle">Draft</text>
    <rect x="${W / 2 - 330}" y="740" width="660" height="120" rx="60" fill="#ffffff"/>
    <text x="${W / 2}" y="820" font-family="${FONT}" font-size="52" font-weight="bold" fill="${BRAND_BLUE}" text-anchor="middle">プロフィールリンクから</text>
    <text x="${W / 2}" y="1000" font-family="${FONT}" font-size="44" fill="#eafcff" text-anchor="middle">一緒に野球を楽しむ仲間が</text>
    <text x="${W / 2}" y="1070" font-family="${FONT}" font-size="44" fill="#eafcff" text-anchor="middle">きっと見つかる</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(outPath);
}
