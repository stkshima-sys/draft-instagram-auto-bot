import { weeklyAnalysis } from "../analytics/weekly.js";

try {
  await weeklyAnalysis();
} catch (e) {
  console.error("❌ 週次分析失敗:", (e as Error).message);
  process.exit(1);
}
