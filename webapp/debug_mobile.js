const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

async function debugMobile() {
  const prisma = new PrismaClient();
  const cookies = await prisma.cookie.findMany({ where: { isActive: true } });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });

  if (cookies.length > 0) {
    await context.addCookies([
      { name: 'li_at', value: cookies[0].value, domain: '.linkedin.com', path: '/' }
    ]);
  }

  const page = await context.newPage();
  const url = 'https://www.linkedin.com/in/danielavargasgarces';
  
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('mobile_page.html', html);
  console.log('HTML saved to mobile_page.html');
  
  await page.screenshot({ path: 'mobile_screenshot.png' });
  console.log('Screenshot saved to mobile_screenshot.png');

  await browser.close();
  await prisma.$disconnect();
}

debugMobile();
