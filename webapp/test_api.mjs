import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:/Users/remon/.gemini/antigravity/scratch/linkedin_scraper/webapp/prisma/dev.db',
    },
  },
});

async function runTest() {
  try {
    const cookies = await prisma.cookie.findMany({ where: { isActive: true } });
    if (cookies.length === 0) return;

    const cookieValue = cookies[0].value;
    const testUsername = 'ikaro-rafael-ti';
    
    let jsessionid = "ajax:12345";
    if (cookieValue.includes("JSESSIONID")) {
      const match = cookieValue.match(/JSESSIONID="?([^";\s]+)"?/);
      jsessionid = match ? match[1] : jsessionid;
    }
    const finalCookie = cookieValue.includes("li_at=") ? cookieValue : `li_at=${cookieValue}; JSESSIONID=${jsessionid}`;
    const csrfToken = jsessionid.replace(/"/g, "");

    console.log(`Testing profileView API for ${testUsername}...`);
    
    // The profileView endpoint is often more reliable
    const url = `https://www.linkedin.com/voyager/api/identity/profiles/${testUsername}/profileView`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.linkedin.normalized+json+2.1",
        "Cookie": finalCookie,
        "Csrf-Token": csrfToken,
        "X-Li-Track": '{"clientVersion":"1.13.5589","osName":"web","mpName":"voyager-web"}',
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    console.log(`Status: ${response.status}`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('SUCCESS!');
      const profile = (data.included || []).find(i => i.$type === "com.linkedin.voyager.dash.identity.profile.Profile");
      if (profile && profile.profilePicture) {
          console.log('Found profile picture reference!');
      }
    } else {
      console.error('FAILED:', JSON.stringify(data).substring(0, 500));
    }

  } catch (err) {
    console.error('TEST FAILED:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
