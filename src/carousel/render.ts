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
const NAVY = "#1b2a4a";
const PINK = "#f2668b";
const CREAM = "#fff8f2";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 全角基準でテキストを折り返す（「まと／め」のような1文字残りを避けるため行長を均等化） */
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const chars = [...para];
    if (chars.length === 0) { out.push(""); continue; }
    const lineCount = Math.ceil(chars.length / maxChars);
    const perLine = Math.ceil(chars.length / lineCount);
    for (let i = 0; i < chars.length; i += perLine) {
      out.push(chars.slice(i, i + perLine).join(""));
    }
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
    <text x="${W / 2}" y="${panelY + panelH - 36}" font-family="${FONT}" font-size="40" fill="${PINK}" text-anchor="middle">保存して球場で見返してね ▶</text>
  </svg>`;

  const base = existsSync(bgPath)
    ? sharp(bgPath).resize(W, H, { fit: "cover" })
    : sharp({ create: { width: W, height: H, channels: 3, background: NAVY } });

  await base.composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toFile(outPath);
}

/** 本文スライド */
export async function renderContent(
  index: number,
  total: number,
  heading: string,
  body: string,
  outPath: string,
): Promise<void> {
  const headLines = wrap(heading, 12);
  const bodyLines = body.split("\n").flatMap((p) => wrap(p, 18));
  const headY = 300;
  const bodyY = headY + headLines.length * 96 + 90;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${CREAM}"/>
        <stop offset="1" stop-color="#ffe9ee"/>
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
    <text x="${W / 2}" y="${H - 80}" font-family="${FONT}" font-size="36" fill="#b0a8a2" text-anchor="middle">Draft ｜ 野球観戦仲間マッチング</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(outPath);
}

/** 最終CTAスライド */
export async function renderCTA(outPath: string): Promise<void> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${NAVY}"/>
        <stop offset="1" stop-color="#2e4370"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <text x="${W / 2}" y="430" font-family="${FONT}" font-size="64" fill="#ffffff" text-anchor="middle">観戦仲間を探すなら</text>
    <text x="${W / 2}" y="620" font-family="${FONT}" font-size="150" font-weight="bold" fill="${PINK}" text-anchor="middle">Draft</text>
    <rect x="${W / 2 - 330}" y="740" width="660" height="120" rx="60" fill="${PINK}"/>
    <text x="${W / 2}" y="820" font-family="${FONT}" font-size="52" font-weight="bold" fill="#ffffff" text-anchor="middle">プロフィールリンクから</text>
    <text x="${W / 2}" y="1000" font-family="${FONT}" font-size="44" fill="#c9d4ea" text-anchor="middle">一緒に野球を楽しむ仲間が</text>
    <text x="${W / 2}" y="1070" font-family="${FONT}" font-size="44" fill="#c9d4ea" text-anchor="middle">きっと見つかる</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(outPath);
}
