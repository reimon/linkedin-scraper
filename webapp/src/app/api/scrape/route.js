import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chromium } from "playwright";

// Manual stealth function to bypass basic bot detection without external plugins
async function applyManualStealth(page) {
  await page.addInitScript(() => {
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Fake languages
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    
    // Fake permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
}

function isRealLinkedInAvatar(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    // Real avatars usually come from media.licdn.com or licdn.com
    return parsed.hostname.includes("licdn.com");
  } catch {
    return false;
  }
}

function looksLikeProfileImageUrl(url) {
  const value = url.toLowerCase();

  if (!value.includes("licdn.com")) return false;
  if (!value.includes("/image/")) return false;
  if (value.includes("profile-background") || value.includes("background") || value.includes("banner")) {
    return false;
  }

  return true;
}

export async function POST(request) {
  try {
    const { count, profileId } = await request.json();
    const limit = parseInt(count) || 1;

    let profilesToProcess = [];

    if (profileId) {
      const selectedProfile = await prisma.profile.findUnique({
        where: { id: profileId },
      });

      if (!selectedProfile) {
        return NextResponse.json(
          { error: "Registro não encontrado." },
          { status: 404 },
        );
      }

      if (
        selectedProfile.profilePictureUrl &&
        selectedProfile.status === "SUCCESS"
      ) {
        return NextResponse.json(
          { error: "Esse registro já possui avatar válido." },
          { status: 400 },
        );
      }

      profilesToProcess = [selectedProfile];
    } else {
      // Fetch records to process in batch mode.
      // Priority: PENDING records
      profilesToProcess = await prisma.profile.findMany({
        where: {
          status: "PENDING",
        },
        take: limit,
      });
      
      // If no PENDING, try to retry ERROR ones
      if (profilesToProcess.length === 0) {
          profilesToProcess = await prisma.profile.findMany({
            where: {
              status: { in: ["ERROR", "ERROR_AUTHWALL"] },
              scratchAttempts: { lt: 5 } // Only retry a few times
            },
            take: limit,
          });
      }
    }

    if (profilesToProcess.length === 0) {
      return NextResponse.json({
        message: "Nenhum perfil pendente ou falhado encontrado.",
        processed: 0,
      });
    }

    // Use a persistent context to better simulate a real browser and handle cookies naturally
    const tempDir = `/tmp/playwright-${Date.now()}`;
    const browserContext = await chromium.launchPersistentContext(tempDir, {
      headless: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    // Apply manual stealth to the context if possible or to each page
    
    let processedCount = 0;
    let authwallCount = 0;

    // Busca os cookies ativos no banco de dados
    const dbCookies = await prisma.cookie.findMany({
      where: { isActive: true },
    });
    
    // Fallback: se não houver no banco, usa do .env
    const envCookies = process.env.LINKEDIN_LI_AT 
      ? process.env.LINKEDIN_LI_AT.split(',').map(c => c.trim()).filter(Boolean) 
      : [];

    const allCookies = dbCookies.length > 0 
      ? dbCookies.map(c => c.value) 
      : envCookies;

    // Inject the first cookie to start with
    if (allCookies.length > 0) {
        await browserContext.addCookies([{
            name: "li_at",
            value: allCookies[0].replace(/["']/g, "").trim(),
            domain: ".linkedin.com",
            path: "/",
            secure: true,
            sameSite: 'None',
        }]);
    }

    let currentCookie = allCookies.length > 0 ? allCookies[0] : null;

    for (const profile of profilesToProcess) {
      const page = await browserContext.newPage();
      await applyManualStealth(page);

      // Rotate cookies if we have multiple
      if (allCookies.length > 1) {
          currentCookie = allCookies[processedCount % allCookies.length];
          await browserContext.addCookies([{
              name: "li_at",
              value: currentCookie.replace(/["']/g, "").trim(),
              domain: ".linkedin.com",
              path: "/",
              secure: true,
              sameSite: 'None',
          }]);
      }

      try {
        console.log(`[SCRAPE] Navigating to ${profile.linkedinUrl} using cookie ${currentCookie?.substring(0, 10)}...`);
        
        const response = await page.goto(profile.linkedinUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        console.log(`[SCRAPE] Status: ${response?.status()} for ${profile.linkedinUrl}`);

        // Extra wait for lazy loading
        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        const html = await page.content();
        
        if (currentUrl.includes('authwall') || html.includes('authwall') || html.includes('challenge')) {
           authwallCount++;
           await prisma.profile.update({
            where: { id: profile.id },
            data: {
              status: "ERROR_AUTHWALL",
              scratchAttempts: { increment: 1 },
            },
           });
           processedCount++;
           continue;
        }

        // Improved selector strategy
        const imgSrc = await page.evaluate(() => {
          const findImages = () => {
            const selectors = [
              "img.pv-top-card-profile-picture__image", // Desktop
              "img.top-card-layout__entity-image",      // Public Desktop
              "img.profile-photo-edit__preview",        // Mobile
              "img.EntityPhoto-circle-7",               // Common class
              "img.EntityPhoto-circle-8",               // Common class
              "img.EntityPhoto-circle-9",               // Common class
              "img.EntityPhoto-circle-10",              // Common class
              "img[alt*='Perfil']",
              "img[alt*='Profile']",
              ".profile-photo-edit__preview img",
              ".presence-entity__image",
              ".top-card__profile-image",
              "img.avatar"
            ];

            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el && el.src && !el.src.includes('data:image')) {
                return el.currentSrc || el.src;
              }
            }

            // Fallback: look for the largest square image from licdn
            const imgs = Array.from(document.querySelectorAll("img"))
              .map(img => {
                const src = img.currentSrc || img.src || "";
                if (!src.includes("licdn.com") || src.includes("background") || src.includes("banner")) return null;
                
                const w = img.naturalWidth || img.width || 0;
                const h = img.naturalHeight || img.height || 0;
                if (w < 50 || h < 50) return null;
                
                const ratio = w / h;
                if (ratio < 0.8 || ratio > 1.25) return null;

                return { src, size: w * h };
              })
              .filter(Boolean)
              .sort((a, b) => b.size - a.size);

            return imgs[0]?.src || null;
          };

          return findImages();
        });

        if (imgSrc && isRealLinkedInAvatar(imgSrc) && looksLikeProfileImageUrl(imgSrc)) {
          await prisma.profile.update({
            where: { id: profile.id },
            data: {
              profilePictureUrl: imgSrc,
              status: "SUCCESS",
              scratchAttempts: {
                increment: 1,
              },
            },
          });
        } else {
          await prisma.profile.update({
            where: { id: profile.id },
            data: {
              profilePictureUrl: null,
              status: "ERROR",
              scratchAttempts: {
                increment: 1,
              },
            },
          });
        }
      } catch (err) {
        console.error(`Error processing ${profile.linkedinUrl}:`, err);
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            status: "ERROR",
            scratchAttempts: {
              increment: 1,
            },
          },
        });
      } finally {
        await page.close();
      }
      processedCount++;
      // Wait between requests
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
    }

    await browserContext.close();

    return NextResponse.json({ 
      success: true, 
      processed: processedCount,
      authwalls: authwallCount 
    });
  } catch (error) {
    console.error("Scrape Error:", error);
    return NextResponse.json(
      { error: "Erro ao executar o scraper." },
      { status: 500 },
    );
  }
}
