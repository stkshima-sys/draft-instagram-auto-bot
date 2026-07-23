import { fetchInsights } from "../analytics/insights.js";

try {
  await fetchInsights();
} catch (e) {
  console.error("❌ インサイト取得失敗:", (e as Error).message);
  process.exit(1);
}
