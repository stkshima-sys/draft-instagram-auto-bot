import { env, GRAPH_API } from "../config/env.js";

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function graph<T>(
  path: string,
  params: Record<string, string>,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const url = new URL(`${GRAPH_API}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: env.igAccessToken });
  let res: Response;
  if (method === "GET") {
    url.search = body.toString();
    res = await fetch(url);
  } else {
    res = await fetch(url, { method: "POST", body });
  }
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) {
    throw new Error(
      `Graph API error (${path}): ${json.error?.message ?? res.statusText} [code=${json.error?.code}]`,
    );
  }
  return json;
}

const IG = () => env.igBusinessAccountId;

/** カルーセルの子アイテム（画像）コンテナ作成 */
export async function createCarouselItem(imageUrl: string): Promise<string> {
  const r = await graph<{ id: string }>(`${IG()}/media`, {
    image_url: imageUrl,
    is_carousel_item: "true",
  }, "POST");
  return r.id;
}

/** カルーセル親コンテナ作成 */
export async function createCarouselContainer(children: string[], caption: string): Promise<string> {
  const r = await graph<{ id: string }>(`${IG()}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
  }, "POST");
  return r.id;
}

/** リールコンテナ作成 */
export async function createReelContainer(videoUrl: string, caption: string): Promise<string> {
  const r = await graph<{ id: string }>(`${IG()}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
  }, "POST");
  return r.id;
}

/** コンテナの処理完了を待つ（動画は数分かかる） */
export async function waitForContainer(creationId: string, timeoutSec = 600): Promise<void> {
  const start = Date.now();
  while (true) {
    const r = await graph<{ status_code: string; status?: string }>(creationId, {
      fields: "status_code,status",
    });
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR") {
      throw new Error(`メディア処理に失敗: ${r.status ?? "unknown"}`);
    }
    if ((Date.now() - start) / 1000 > timeoutSec) {
      throw new Error(`メディア処理がタイムアウト（${timeoutSec}秒）: ${creationId}`);
    }
    await new Promise((res) => setTimeout(res, 10_000));
  }
}

/** コンテナを公開し、メディアIDを返す */
export async function publish(creationId: string): Promise<string> {
  const r = await graph<{ id: string }>(`${IG()}/media_publish`, { creation_id: creationId }, "POST");
  return r.id;
}

/** 公開済みメディアのpermalink取得 */
export async function getPermalink(mediaId: string): Promise<string> {
  const r = await graph<{ permalink?: string }>(mediaId, { fields: "permalink" });
  return r.permalink ?? "";
}

/**
 * メディア単位のインサイト取得。
 * Metaは指標名を頻繁に変えるため、未対応指標は0で埋めて続行する。
 */
export async function getMediaInsights(mediaId: string): Promise<Record<string, number>> {
  const metrics = ["reach", "views", "likes", "comments", "shares", "saved", "profile_visits", "follows", "total_interactions"];
  const out: Record<string, number> = {};
  // まとめて取得を試み、失敗したら1つずつ取得（未対応指標をスキップするため）
  try {
    const r = await graph<{ data: { name: string; values: { value: number }[] }[] }>(
      `${mediaId}/insights`, { metric: metrics.join(",") },
    );
    for (const d of r.data) out[d.name] = d.values?.[0]?.value ?? 0;
  } catch {
    for (const m of metrics) {
      try {
        const r = await graph<{ data: { name: string; values: { value: number }[] }[] }>(
          `${mediaId}/insights`, { metric: m },
        );
        out[m] = r.data?.[0]?.values?.[0]?.value ?? 0;
      } catch {
        out[m] = 0;
      }
    }
  }
  return out;
}

/** アカウント基本情報（フォロワー数など） */
export async function getAccountSnapshot(): Promise<{ followers: number; follows: number; mediaCount: number }> {
  const r = await graph<{ followers_count: number; follows_count: number; media_count: number }>(
    IG(), { fields: "followers_count,follows_count,media_count" },
  );
  return { followers: r.followers_count, follows: r.follows_count, mediaCount: r.media_count };
}

/** アカウント単位の日次インサイト（プロフィール閲覧・サイトクリック・リーチ） */
export async function getAccountInsights(): Promise<{ profileViews: number; websiteClicks: number; reach: number }> {
  const out = { profileViews: 0, websiteClicks: 0, reach: 0 };
  const tryMetric = async (metric: string, extra: Record<string, string> = {}): Promise<number> => {
    try {
      const r = await graph<{ data: { values?: { value: number }[]; total_value?: { value: number } }[] }>(
        `${IG()}/insights`, { metric, period: "day", ...extra },
      );
      const d = r.data?.[0];
      return d?.total_value?.value ?? d?.values?.at(-1)?.value ?? 0;
    } catch {
      return 0;
    }
  };
  out.profileViews = await tryMetric("profile_views", { metric_type: "total_value" });
  out.websiteClicks = await tryMetric("website_clicks", { metric_type: "total_value" });
  out.reach = await tryMetric("reach");
  return out;
}
