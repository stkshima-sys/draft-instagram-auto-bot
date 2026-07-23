import { generateCarousel } from "../carousel/generate.js";
import { postCarousel } from "../carousel/post.js";

const mode = process.argv[2];
try {
  if (mode === "generate") await generateCarousel();
  else if (mode === "post") await postCarousel();
  else throw new Error("usage: carousel.ts <generate|post>");
} catch (e) {
  console.error(`❌ carousel ${mode} 失敗:`, (e as Error).message);
  process.exit(1);
}
