import { google, sheets_v4 } from "googleapis";
import { readFileSync, existsSync } from "node:fs";
import { env } from "../config/env.js";

export const POSTS_SHEET = "Instagram_Posts";
export const ACCOUNT_SHEET = "Account_Daily";

/** Instagram_Posts のヘッダー（列順は固定。指標更新はこの順に依存する） */
export const POSTS_HEADER = [
  "Date", "Time", "Type", "Category", "Title", "Caption", "Hashtags",
  "Image Prompt", "Video Prompt", "Post URL", "Media ID",
  "Reach", "Impressions", "Likes", "Comments", "Shares", "Saves",
  "Profile Visits", "Followers Gained", "Website Clicks",
] as const;

export const ACCOUNT_HEADER = [
  "Date", "Followers", "Follows", "Media Count", "Profile Views", "Website Clicks", "Reach",
] as const;

function auth() {
  const raw = env.serviceAccountJson.trim();
  const json = raw.startsWith("{")
    ? JSON.parse(raw)
    : JSON.parse(readFileSync(raw, "utf-8"));
  return new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

let _api: sheets_v4.Sheets | null = null;
function api(): sheets_v4.Sheets {
  if (!_api) _api = google.sheets({ version: "v4", auth: auth() });
  return _api;
}

/** シートが無ければ作成し、1行目にヘッダーを入れる */
export async function ensureSheet(title: string, header: readonly string[]): Promise<void> {
  const meta = await api().spreadsheets.get({ spreadsheetId: env.sheetsId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (!exists) {
    await api().spreadsheets.batchUpdate({
      spreadsheetId: env.sheetsId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await api().spreadsheets.values.update({
      spreadsheetId: env.sheetsId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [[...header]] },
    });
  }
}

export async function appendRow(sheet: string, row: (string | number)[]): Promise<void> {
  await api().spreadsheets.values.append({
    spreadsheetId: env.sheetsId,
    range: `${sheet}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

/** ヘッダー行を除く全行を取得（行番号付き。updateRowで使う） */
export async function readRows(sheet: string): Promise<{ rowIndex: number; values: string[] }[]> {
  const res = await api().spreadsheets.values.get({
    spreadsheetId: env.sheetsId,
    range: `${sheet}!A2:Z`,
  });
  return (res.data.values ?? []).map((values, i) => ({ rowIndex: i + 2, values: values as string[] }));
}

/** 指定行の指定範囲（列名〜列名）を更新 */
export async function updateCells(
  sheet: string,
  rowIndex: number,
  startCol: string,
  values: (string | number)[],
): Promise<void> {
  await api().spreadsheets.values.update({
    spreadsheetId: env.sheetsId,
    range: `${sheet}!${startCol}${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
}
