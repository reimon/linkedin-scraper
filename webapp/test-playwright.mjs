import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const profile = await prisma.profile.findFirst({
    where: { status: 'PENDING' }
  });

  if (!profile) {
    console.log("No pending profile found.");
    return;
  }

  console.log(`Testing with profile: ${profile.name} - ${profile.linkedinUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  console.log("Navigating...");
  try {
      await page.goto(profile.linkedinUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(3000);

      const html = await page.content();
      console.log(`Page title: ${await page.title()}`);
      
      if (html.includes('authwall') || html.includes('login') || page.url().includes('authwall')) {
        console.log("Authwall detected! Current URL: " + page.url());
      }

      const imgs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          className: img.className,
          alt: img.alt,
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        })).filter(img => img.src && img.src.includes('media.licdn.com'));
      });

      console.log(`Found ${imgs.length} media.licdn.com images.`);
      if (imgs.length > 0) {
          console.log(imgs.slice(0, 5));
      }
  } catch (err) {
      console.log('Error navigating', err);
  }

  await browser.close();
}

main().catch(console.error);
