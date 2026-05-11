import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log("Navigating...");
  try {
      await page.goto("https://www.linkedin.com/in/ikaro-rafael-ti", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);

      const imgSrc = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll("img"));

          const candidates = imgs
            .map((img) => {
              const src = img.currentSrc || img.src || "";
              if (
                !src.includes("media.licdn.com") ||
                !src.includes("/dms/image/")
              ) {
                return null;
              }

              const classText = (img.className || "").toString().toLowerCase();
              const altText = (img.alt || "").toLowerCase();
              const idText = (img.id || "").toLowerCase();
              const text = `${classText} ${altText} ${idText}`;
              const srcText = src.toLowerCase();

              // Reject likely banner/background images.
              if (
                text.includes("background") ||
                text.includes("banner") ||
                srcText.includes("background") ||
                srcText.includes("profile-background")
              ) {
                return null;
              }

              const width =
                img.naturalWidth || img.width || img.clientWidth || 0;
              const height =
                img.naturalHeight || img.height || img.clientHeight || 0;
              if (!width || !height) return null;

              const ratio = width / height;
              if (ratio < 0.75 || ratio > 1.35) return null;
              if (Math.min(width, height) < 40) return null;

              let score = 0;
              if (srcText.includes("profile-displayphoto")) score += 5;
              if (text.includes("entity-image")) score += 4;
              if (text.includes("profile")) score += 2;
              if (text.includes("avatar")) score += 2;

              score += Math.min(width, height) / 100;

              return {
                src,
                score,
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);

          console.log(candidates); // This will just print in browser console
          return candidates[0] || null;
        });

      console.log(`EVALUATE RESULT:`, imgSrc);
  } catch (err) {
      console.log('Error navigating', err);
  }

  await browser.close();
}

main().catch(console.error);
