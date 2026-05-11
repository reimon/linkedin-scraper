import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36",
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  console.log("Navigating to everton-garcia with mobile UA...");
  try {
      await page.goto("https://www.linkedin.com/in/everton-garcia", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      if (html.includes('authwall') || page.url().includes('authwall') || html.includes('login') || page.url().includes('signup')) {
          console.log('AUTHWALL HIT!');
          console.log('URL is:', page.url());
      } else {
          console.log('No Authwall detected.');
      }

      const imgSrc = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll("img"));
          console.log(`Found ${imgs.length} total images`);
          return imgs.filter(i => i.src && i.src.includes('media.licdn.com')).map(i => i.src);
      });

      console.log(`EVALUATE RESULT media.licdn.com images:`, imgSrc);
  } catch (err) {
      console.log('Error navigating', err);
  }

  await browser.close();
}

main().catch(console.error);
