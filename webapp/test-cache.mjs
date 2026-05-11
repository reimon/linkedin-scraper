import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log("Navigating to google cache...");
  try {
      await page.goto("https://webcache.googleusercontent.com/search?q=cache:https://www.linkedin.com/in/everton-garcia", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      if (html.includes('404. That’s an error.')) {
          console.log('Cache not found.');
      } else {
          const imgSrc = await page.evaluate(() => {
              const imgs = Array.from(document.querySelectorAll("img"));
              return imgs.filter(i => i.src && i.src.includes('media.licdn.com')).length;
          });

          console.log(`EVALUATE RESULT media.licdn.com images:`, imgSrc);
      }
  } catch (err) {
      console.log('Error navigating', err);
  }

  await browser.close();
}

main().catch(console.error);
