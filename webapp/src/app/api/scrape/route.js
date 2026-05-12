import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function extractUsername(url) {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

async function fetchLinkedInProfile(username, cookieValue) {
  // Extract JSESSIONID for the CSRF token if present
  let jsessionid = null;
  if (cookieValue.includes("JSESSIONID")) {
    const match = cookieValue.match(/JSESSIONID="?([^";\s]+)"?/);
    jsessionid = match ? match[1] : null;
  }

  // Construct a proper cookie string
  // If cookieValue is just the li_at token, we add a dummy JSESSIONID
  let finalCookie = cookieValue;
  if (!cookieValue.includes("li_at=")) {
    finalCookie = `li_at=${cookieValue.replace(/["']/g, "").trim()}`;
    if (jsessionid) {
        finalCookie += `; JSESSIONID=${jsessionid}`;
    } else {
        // Fallback dummy JSESSIONID if not found (needed for Csrf-Token header)
        finalCookie += `; JSESSIONID="ajax:12345"`;
        jsessionid = "ajax:12345";
    }
  } else if (!cookieValue.includes("JSESSIONID")) {
    finalCookie += `; JSESSIONID="ajax:12345"`;
    jsessionid = "ajax:12345";
  }

  const csrfToken = jsessionid ? jsessionid.replace(/"/g, "") : "ajax:12345";

  const url = `https://www.linkedin.com/voyager/api/identity/profiles/${username}?decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfile-58`;

  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.linkedin.normalized+json+2.1",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": finalCookie,
      "Csrf-Token": csrfToken,
      "X-Li-Track": '{"clientVersion":"1.13.5589","mpVersion":"1.13.5589","osName":"web","timezoneOffset":-3,"timezone":"America/Sao_Paulo","deviceFormFactor":"DESKTOP","mpName":"voyager-web","displayDensity":1,"displayWidth":1920,"displayHeight":1080}',
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LinkedIn API returned ${response.status}: ${text.substring(0, 100)}`);
  }

  return await response.json();
}

function findProfilePhotoInJson(json) {
  if (!json || !json.included) return null;

  // Find the profile object
  const profile = json.included.find(item => 
    item.$type === "com.linkedin.voyager.dash.identity.profile.Profile" ||
    (item.entityUrn && item.entityUrn.includes("urn:li:fsd_profile:"))
  );

  if (!profile || !profile.profilePicture) return null;

  // The profilePicture is usually a reference to another object
  const photoUrn = profile.profilePicture["*displayImage"];
  
  // Find the image object in the 'included' array
  const imageObj = json.included.find(item => item.entityUrn === photoUrn);
  if (!imageObj || !imageObj.elements || imageObj.elements.length === 0) return null;

  // Get the largest image element
  const sortedElements = [...imageObj.elements].sort((a, b) => 
    (b.displaySize?.width || 0) - (a.displaySize?.width || 0)
  );

  const bestElement = sortedElements[0];
  const rootUrl = imageObj.rootUrl;
  const artifact = bestElement.artifacts?.[0]?.fileIdentifyingUrlPathSegment || bestElement.fileIdentifyingUrlPathSegment;

  if (rootUrl && artifact) {
    return rootUrl + artifact;
  }

  return null;
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
        return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
      }

      profilesToProcess = [selectedProfile];
    } else {
      profilesToProcess = await prisma.profile.findMany({
        where: { status: "PENDING" },
        take: limit,
      });
      
      if (profilesToProcess.length === 0) {
          profilesToProcess = await prisma.profile.findMany({
            where: {
              status: { in: ["ERROR", "ERROR_AUTHWALL"] },
              scratchAttempts: { lt: 5 }
            },
            take: limit,
          });
      }
    }

    if (profilesToProcess.length === 0) {
      return NextResponse.json({ message: "Nenhum perfil para processar.", processed: 0 });
    }

    let processedCount = 0;
    let authwallCount = 0;

    const dbCookies = await prisma.cookie.findMany({ where: { isActive: true } });
    const envCookies = process.env.LINKEDIN_LI_AT 
      ? process.env.LINKEDIN_LI_AT.split(',').map(c => c.trim()).filter(Boolean) 
      : [];

    const allCookies = dbCookies.length > 0 ? dbCookies.map(c => c.value) : envCookies;

    if (allCookies.length === 0) {
        return NextResponse.json({ error: "Sem cookies de autenticação." }, { status: 401 });
    }

    for (const profile of profilesToProcess) {
      const currentCookie = allCookies[processedCount % allCookies.length];
      const username = extractUsername(profile.linkedinUrl);

      if (!username) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { status: "ERROR", scratchAttempts: { increment: 1 } },
        });
        processedCount++;
        continue;
      }

      try {
        console.log(`[SCRAPE] API fetch for ${username}...`);
        const profileData = await fetchLinkedInProfile(username, currentCookie);
        const imgSrc = findProfilePhotoInJson(profileData);

        if (imgSrc) {
          await prisma.profile.update({
            where: { id: profile.id },
            data: {
              profilePictureUrl: imgSrc,
              status: "SUCCESS",
              scratchAttempts: { increment: 1 },
            },
          });
        } else {
          await prisma.profile.update({
            where: { id: profile.id },
            data: { status: "ERROR", scratchAttempts: { increment: 1 } },
          });
        }
      } catch (err) {
        console.error(`[SCRAPE] Error ${username}:`, err.message);
        const isAuthwall = err.message.includes("403") || err.message.includes("401");
        if (isAuthwall) authwallCount++;
        
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            status: isAuthwall ? "ERROR_AUTHWALL" : "ERROR",
            scratchAttempts: { increment: 1 },
          },
        });
      }
      processedCount++;
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }

    return NextResponse.json({ success: true, processed: processedCount, authwalls: authwallCount });
  } catch (error) {
    console.error("Scrape Error:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
