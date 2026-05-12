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
    if (jsessionid) {
        finalCookie += `; JSESSIONID=${jsessionid}`;
    } else {
        finalCookie += `; JSESSIONID="ajax:12345"`;
        jsessionid = "ajax:12345";
    }
  } else if (!cookieValue.includes("JSESSIONID")) {
    finalCookie += `; JSESSIONID="ajax:12345"`;
    jsessionid = "ajax:12345";
  }

  const csrfToken = jsessionid ? jsessionid.replace(/"/g, "") : "ajax:12345";
  const url = `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(username)}/profileView`;

  console.log(`[SCRAPE] Requesting: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      "Accept": "application/vnd.linkedin.normalized+json+2.1",
      "Cookie": finalCookie,
      "Csrf-Token": csrfToken,
      "X-Li-Track": '{"clientVersion":"1.13.5589","osName":"web","mpName":"voyager-web"}',
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    // Adding a timeout and disabling cache
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
  }

  return await response.json();
}

function findProfilePhotoInJson(json) {
  if (!json || !json.included) return null;
  const profile = json.included.find(item => item.$type === "com.linkedin.voyager.dash.identity.profile.Profile");
  if (!profile || !profile.profilePicture) return null;
  const photoUrn = profile.profilePicture["*displayImage"];
  const imageObj = json.included.find(item => item.entityUrn === photoUrn);
  if (!imageObj || !imageObj.elements || imageObj.elements.length === 0) return null;
  const bestElement = [...imageObj.elements].sort((a, b) => (b.displaySize?.width || 0) - (a.displaySize?.width || 0))[0];
  const rootUrl = imageObj.rootUrl;
  const artifact = bestElement.artifacts?.[0]?.fileIdentifyingUrlPathSegment || bestElement.fileIdentifyingUrlPathSegment;
  return (rootUrl && artifact) ? (rootUrl + artifact) : null;
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
      profilesToProcess = await prisma.profile.findMany({ where: { status: "PENDING" }, take: limit });
      if (profilesToProcess.length === 0) {
        profilesToProcess = await prisma.profile.findMany({ where: { status: { in: ["ERROR", "ERROR_AUTHWALL"] }, scratchAttempts: { lt: 5 } }, take: limit });
      }
    }

    if (profilesToProcess.length === 0) return NextResponse.json({ message: "Vazio.", processed: 0 });

    const cookies = await prisma.cookie.findMany({ where: { isActive: true } });
    if (cookies.length === 0) return NextResponse.json({ error: "No cookies." }, { status: 401 });
    const allCookies = cookies.map(c => c.value);

    let processedCount = 0;
    let authwallCount = 0;

    for (const profile of profilesToProcess) {
      const currentCookie = allCookies[processedCount % allCookies.length];
      const username = extractUsername(profile.linkedinUrl);

      if (!username) {
        await prisma.profile.update({ where: { id: profile.id }, data: { status: "ERROR", scratchAttempts: { increment: 1 } } });
        processedCount++;
        continue;
      }

      try {
        const data = await fetchLinkedInProfile(username, currentCookie);
        const photoUrl = findProfilePhotoInJson(data);
        await prisma.profile.update({
          where: { id: profile.id },
          data: { profilePictureUrl: photoUrl, status: photoUrl ? "SUCCESS" : "ERROR", scratchAttempts: { increment: 1 } }
        });
        console.log(`[SCRAPE] OK: ${username}`);
      } catch (err) {
        console.error(`[SCRAPE] FAIL ${username}:`, err);
        const isAuth = err.message.includes("401") || err.message.includes("403");
        if (isAuth) authwallCount++;
        await prisma.profile.update({
          where: { id: profile.id },
          data: { status: isAuth ? "ERROR_AUTHWALL" : "ERROR", scratchAttempts: { increment: 1 } }
        });
      }
      processedCount++;
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }
    return NextResponse.json({ success: true, processed: processedCount, authwalls: authwallCount });
  } catch (error) {
    console.error("Critical:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
