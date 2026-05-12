import {
  ProviderError,
  ProviderErrorCode,
} from "@/lib/scraping/providers/types";

const REQUEST_TIMEOUT_MS = 12000;
const PROVIDER_NAME = "local-voyager";

function extractUsername(url) {
  if (!url) return null;
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) return null;

  const numeric = Number(retryAfterHeader);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric * 1000));
  }

  const parsedDate = Date.parse(retryAfterHeader);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return null;
}

function buildHeaders(cookieValue) {
  let jsessionid = null;
  if (cookieValue?.includes("JSESSIONID")) {
    const match = cookieValue.match(/JSESSIONID="?([^";\s]+)"?/);
    jsessionid = match ? match[1] : null;
  }

  const csrfToken = jsessionid ? jsessionid.replace(/"/g, "") : "ajax:12345";

  return {
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    Cookie: cookieValue,
    "Csrf-Token": csrfToken,
    "X-Li-Track":
      '{"clientVersion":"1.13.5589","osName":"web","mpName":"voyager-web"}',
    "X-Restli-Protocol-Version": "2.0.0",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };
}

function findPhoto(json) {
  if (json?.isPublic) return json.photoUrl;
  if (!json?.included) return null;

  const photos = json.included.filter(
    (item) => item.rootUrl && item.rootUrl.includes("profile-displayphoto"),
  );

  if (photos.length === 0) return null;

  const photo = photos[0];
  const element = photo.elements?.sort(
    (a, b) => (b.displaySize?.width || 0) - (a.displaySize?.width || 0),
  )[0];

  if (!element) return null;

  return (
    photo.rootUrl +
    (element.artifacts?.[0]?.fileIdentifyingUrlPathSegment ||
      element.fileIdentifyingUrlPathSegment)
  );
}

async function fetchVoyagerJson(username, headers) {
  const urls = [
    `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(username)}/profileView`,
    `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-85`,
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.ok) {
      return await res.json();
    }

    if ([429, 999].includes(res.status)) {
      throw new ProviderError(
        ProviderErrorCode.RATE_LIMIT,
        "LinkedIn rate limit.",
        {
          status: res.status,
          retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
        },
      );
    }

    if ([401, 403].includes(res.status)) {
      throw new ProviderError(
        ProviderErrorCode.AUTHWALL,
        "Sessao bloqueada ou expirada.",
        { status: res.status },
      );
    }
  }

  return null;
}

async function fetchPublicFallback(username, userAgent) {
  const publicUrl = `https://www.linkedin.com/in/${username}/`;

  const res = await fetch(publicUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.ok) {
    const html = await res.text();
    const photoMatch =
      html.match(
        /class="pv-top-card-profile-picture__image[^>]+src="([^"]+)"/i,
      ) ||
      html.match(/property="og:image" content="([^"]+)"/i) ||
      html.match(/\{"memberPhoto":"([^"]+)"/i);

    if (photoMatch) {
      return photoMatch[1].replace(/&amp;/g, "&");
    }
  }

  if ([429, 999].includes(res.status)) {
    throw new ProviderError(
      ProviderErrorCode.RATE_LIMIT,
      "LinkedIn rate limit.",
      {
        status: res.status,
        retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
      },
    );
  }

  if ([401, 403].includes(res.status)) {
    throw new ProviderError(
      ProviderErrorCode.AUTHWALL,
      "Sessao bloqueada ou expirada.",
      { status: res.status },
    );
  }

  return null;
}

async function tryResolveWithCookie(linkedinUrl, cookieValue) {
  const username = extractUsername(linkedinUrl);
  if (!username) {
    return {
      ok: false,
      errorCode: ProviderErrorCode.NOT_FOUND,
      diagnostics: { provider: PROVIDER_NAME, reason: "invalid_profile_url" },
    };
  }

  const headers = buildHeaders(cookieValue);

  try {
    const voyagerJson = await fetchVoyagerJson(username, headers);
    const photoFromVoyager = findPhoto(voyagerJson);
    if (photoFromVoyager) {
      return {
        ok: true,
        photoUrl: photoFromVoyager,
        diagnostics: { provider: PROVIDER_NAME, source: "voyager" },
      };
    }

    const photoFromPublic = await fetchPublicFallback(
      username,
      headers["User-Agent"],
    );
    if (photoFromPublic) {
      return {
        ok: true,
        photoUrl: photoFromPublic,
        diagnostics: { provider: PROVIDER_NAME, source: "public_html" },
      };
    }

    return {
      ok: false,
      errorCode: ProviderErrorCode.NOT_FOUND,
      diagnostics: { provider: PROVIDER_NAME, reason: "photo_not_found" },
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        ok: false,
        errorCode: error.code,
        diagnostics: {
          provider: PROVIDER_NAME,
          ...error.details,
        },
      };
    }

    return {
      ok: false,
      errorCode: ProviderErrorCode.UNKNOWN,
      diagnostics: {
        provider: PROVIDER_NAME,
        reason: "unexpected_provider_error",
      },
    };
  }
}

export async function resolveLocalVoyagerPhoto({ linkedinUrl, cookieValues }) {
  if (!Array.isArray(cookieValues) || cookieValues.length === 0) {
    return {
      ok: false,
      errorCode: ProviderErrorCode.AUTHWALL,
      diagnostics: { provider: PROVIDER_NAME, reason: "missing_active_cookie" },
    };
  }

  let lastFailure = {
    ok: false,
    errorCode: ProviderErrorCode.UNKNOWN,
    diagnostics: { provider: PROVIDER_NAME },
  };

  for (const cookieValue of cookieValues) {
    const result = await tryResolveWithCookie(linkedinUrl, cookieValue);
    if (result.ok) return result;

    lastFailure = result;
    if (
      result.errorCode !== ProviderErrorCode.RATE_LIMIT &&
      result.errorCode !== ProviderErrorCode.AUTHWALL
    ) {
      return result;
    }
  }

  return lastFailure;
}
