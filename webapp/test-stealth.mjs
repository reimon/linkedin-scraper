import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  
  // Add init script to remove webdriver
  await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
  
  const page = await context.newPage();

  console.log("Navigating to everton-garcia...");
  try {
      await page.goto("https://br.linkedin.com/in/everton-garcia", { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      if (html.includes('authwall') || page.url().includes('authwall') || html.includes('login')) {
          console.log('AUTHWALL HIT!');
          console.log('URL is:', page.url());
      } else {
          console.log('No Authwall detected.');
      }

      const imgSrc = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll("img"));
          return imgs.filter(i => i.src && i.src.includes('media.licdn.com')).length;
      });

      console.log(`EVALUATE RESULT media.licdn.com images count:`, imgSrc);
  } catch (err) {
      console.log('Error navigating', err);
  }

  await browser.close();
}

main().catch(console.error);
