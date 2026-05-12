import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function extractUsername(url) {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return match[1];
  }
}

async function fetchLinkedInProfile(username, cookieValue) {
  let jsessionid = null;
  if (cookieValue.includes("JSESSIONID")) {
    const match = cookieValue.match(/JSESSIONID="?([^";\s]+)"?/);
    jsessionid = match ? match[1] : null;
  }

  let finalCookie = cookieValue;
  if (!cookieValue.includes("li_at=")) {
    finalCookie = `li_at=${cookieValue.replace(/["']/g, "").trim()}`;
    if (jsessionid) finalCookie += `; JSESSIONID=${jsessionid}`;
    else {
      finalCookie += `; JSESSIONID="ajax:12345"`;
      jsessionid = "ajax:12345";
    }
  }

  const csrfToken = jsessionid ? jsessionid.replace(/"/g, "") : "ajax:12345";
  
  // Use a common decoration ID that works for most profiles
  const url = `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(username)}/profileView`;

  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.linkedin.normalized+json+2.1",
      "Cookie": finalCookie,
      "Csrf-Token": csrfToken,
      "X-Li-Track": '{"clientVersion":"1.13.5589","osName":"web","mpName":"voyager-web"}',
      "X-Restli-Protocol-Version": "2.0.0",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    // If 410, try the identity dash endpoint which sometimes works as a backup
    if (response.status === 410 || response.status === 404) {
      const altUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-85`;
      const altRes = await fetch(altUrl, {
        headers: {
          "Accept": "application/vnd.linkedin.normalized+json+2.1",
          "Cookie": finalCookie,
          "Csrf-Token": csrfToken,
          "X-Li-Track": '{"clientVersion":"1.13.5589","osName":"web","mpName":"voyager-web"}',
          "X-Restli-Protocol-Version": "2.0.0",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (altRes.ok) return await altRes.json();
    }
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 50)}`);
  }

  return await response.json();
}

function findProfilePhotoInJson(json) {
  if (!json || !json.included) return null;
  
  // Try dash profile structure
  const dashProfile = json.included.find(item => item.$type === "com.linkedin.voyager.dash.identity.profile.Profile");
  if (dashProfile && dashProfile.profilePicture) {
    const photoUrn = dashProfile.profilePicture["*displayImage"];
    const imageObj = json.included.find(item => item.entityUrn === photoUrn);
    if (imageObj && imageObj.elements?.length > 0) {
      const best = [...imageObj.elements].sort((a, b) => (b.displaySize?.width || 0) - (a.displaySize?.width || 0))[0];
      const artifact = best.artifacts?.[0]?.fileIdentifyingUrlPathSegment || best.fileIdentifyingUrlPathSegment;
      if (imageObj.rootUrl && artifact) return imageObj.rootUrl + artifact;
    }
  }

  // Try legacy profile structure
  const legacyProfile = json.included.find(item => item.$type === "com.linkedin.voyager.identity.profile.Profile");
  if (legacyProfile && legacyProfile.picture) {
    const imageObj = legacyProfile.picture["com.linkedin.common.VectorImage"];
    if (imageObj && imageObj.elements?.length > 0) {
      const best = [...imageObj.elements].sort((a, b) => (b.displaySize?.width || 0) - (a.displaySize?.width || 0))[0];
      const artifact = best.artifacts?.[0]?.fileIdentifyingUrlPathSegment || best.fileIdentifyingUrlPathSegment;
      if (imageObj.rootUrl && artifact) return imageObj.rootUrl + artifact;
    }
  }

  // Last resort: search for any profile photo URL
  const anyPhoto = json.included.find(item => item.rootUrl && item.rootUrl.includes("profile-displayphoto"));
  if (anyPhoto && anyPhoto.elements?.length > 0) {
    const best = [...anyPhoto.elements].sort((a, b) => (b.displaySize?.width || 0) - (a.displaySize?.width || 0))[0];
    const artifact = best.artifacts?.[0]?.fileIdentifyingUrlPathSegment || best.fileIdentifyingUrlPathSegment;
    if (anyPhoto.rootUrl && artifact) return anyPhoto.rootUrl + artifact;
  }

  return null;
}

export async function POST(request) {
  try {
    const { count, profileId } = await request.json();
    const limit = parseInt(count) || 1;
    let profilesToProcess = [];

    if (profileId) {
      const p = await prisma.profile.findUnique({ where: { id: profileId } });
      if (p) profilesToProcess = [p];
    } else {
      profilesToProcess = await prisma.profile.findMany({ 
        where: { status: "PENDING" }, 
        orderBy: { createdAt: 'desc' }, // Try different order
        take: limit 
      });
      if (profilesToProcess.length === 0) {
        profilesToProcess = await prisma.profile.findMany({ 
          where: { status: { in: ["ERROR", "ERROR_AUTHWALL"] }, scratchAttempts: { lt: 5 } }, 
          take: limit 
        });
      }
    }

    if (profilesToProcess.length === 0) return NextResponse.json({ message: "Vazio.", processed: 0 });

    const cookies = await prisma.cookie.findMany({ where: { isActive: true } });
    if (cookies.length === 0) return NextResponse.json({ error: "Sem cookies." }, { status: 401 });
    const currentCookie = cookies[0].value;

    let processedCount = 0;
    let successCount = 0;
    let authwallCount = 0;

    for (const profile of profilesToProcess) {
      const username = extractUsername(profile.linkedinUrl);
      if (!username) {
        await prisma.profile.update({ where: { id: profile.id }, data: { status: "ERROR", scratchAttempts: { increment: 1 } } });
        continue;
      }

      try {
        console.log(`[SCRAPE] Processing: ${username}`);
        const data = await fetchLinkedInProfile(username, currentCookie);
        const photoUrl = findProfilePhotoInJson(data);
        
        await prisma.profile.update({
          where: { id: profile.id },
          data: { 
            profilePictureUrl: photoUrl, 
            status: photoUrl ? "SUCCESS" : "ERROR", 
            scratchAttempts: { increment: 1 } 
          }
        });
        
        if (photoUrl) {
          console.log(`[SCRAPE] SUCCESS: ${username}`);
          successCount++;
        } else {
          console.log(`[SCRAPE] NO PHOTO: ${username}`);
        }
      } catch (err) {
        console.error(`[SCRAPE] FAIL ${username}:`, err.message);
        const isAuth = err.message.includes("401") || err.message.includes("403");
        if (isAuth) authwallCount++;
        await prisma.profile.update({
          where: { id: profile.id },
          data: { status: isAuth ? "ERROR_AUTHWALL" : "ERROR", scratchAttempts: { increment: 1 } }
        });
      }
      processedCount++;
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
    }

    return NextResponse.json({ success: true, processed: processedCount, found: successCount, authwalls: authwallCount });
  } catch (error) {
    console.error("Critical:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
