const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { PrismaClient } = require('@prisma/client');

chromium.use(stealth);

async function testScrape() {
  const prisma = new PrismaClient();
  const cookies = await prisma.cookie.findMany({ where: { isActive: true } });
  
  if (cookies.length === 0) {
    console.log('No cookies found in DB');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  // Try to set cookies for both .linkedin.com and www.linkedin.com
  const cookieValue = cookies[0].value;
  await context.addCookies([
    {
      name: 'li_at',
      value: cookieValue,
      domain: '.linkedin.com',
      path: '/',
      secure: true,
      sameSite: 'None',
    }
  ]);

  const page = await context.newPage();
  
  // Set extra headers to look like a real browser
  await page.setExtraHTTPHeaders({
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'upgrade-insecure-requests': '1',
  });

  const testUrl = 'https://www.linkedin.com/in/reidhoffman/'; 

  console.log(`Navigating to ${testUrl}...`);
  try {
    const response = await page.goto(testUrl, { 
      waitUntil: 'networkidle', // Wait for more stability
      timeout: 30000 
    });
    
    console.log(`Status: ${response.status()}`);
    const currentUrl = page.url();
    console.log(`Final URL: ${currentUrl}`);

    await page.screenshot({ path: 'linkedin_test.png', fullPage: true });
    console.log('Screenshot saved to linkedin_test.png');

    const html = await page.content();
    if (html.includes('authwall') || currentUrl.includes('authwall')) {
      console.log('AUTH WALL DETECTED');
    } else if (response.status() === 200) {
      console.log('SUCCESS! Page loaded.');
      
      const imgSrc = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map(img => ({
          src: img.currentSrc || img.src,
          alt: img.alt,
          width: img.naturalWidth,
          className: img.className
        })).filter(img => img.src && img.src.includes('media.licdn.com'));
      });
      console.log('Found images:', imgSrc.length);
      console.log('Top image:', imgSrc[0]);
    }
  } catch (err) {
    console.error('Error during navigation:', err.message);
    await page.screenshot({ path: 'error_screenshot.png' });
  }

  await browser.close();
  await prisma.$disconnect();
}

testScrape();
