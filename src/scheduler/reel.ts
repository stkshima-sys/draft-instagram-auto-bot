import { generateReel } from "../reels/generate.js";
import { generateVideo } from "../reels/video.js";
import { postReel } from "../reels/post.js";

const mode = process.argv[2];
try {
  if (mode === "generate") await generateReel();
  else if (mode === "video") await generateVideo();
  else if (mode === "post") await postReel();
  else throw new Error("usage: reel.ts <generate|video|post>");
} catch (e) {
  console.error(`❌ reel ${mode} 失敗:`, (e as Error).message);
  process.exit(1);
}
