import { ProviderErrorCode } from "@/lib/scraping/providers/types";

const PROVIDER_NAME = "apify";

function extractPhotoUrl(item) {
  if (!item || typeof item !== "object") return null;

  const directKeys = [
    "profilePictureUrl",
    "avatarUrl",
    "photoUrl",
    "image",
    "imageUrl",
  ];

  for (const key of directKeys) {
    if (typeof item[key] === "string" && item[key].trim()) {
      return item[key].trim();
    }
  }

  if (item.profile && typeof item.profile === "object") {
    return extractPhotoUrl(item.profile);
  }

  return null;
}

function normalizeApifyError(status, message) {
  if ([429].includes(status)) return ProviderErrorCode.RATE_LIMIT;
  if ([401, 403].includes(status)) return ProviderErrorCode.AUTHWALL;
  if ([408, 504].includes(status)) return ProviderErrorCode.TIMEOUT;
  if (status >= 500) return ProviderErrorCode.NETWORK;
  if (
    typeof message === "string" &&
    message.toLowerCase().includes("timeout")
  ) {
    return ProviderErrorCode.TIMEOUT;
  }
  return ProviderErrorCode.UNKNOWN;
}

export async function resolveApifyPhoto({ linkedinUrl }) {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;

  if (!token || !actorId) {
    return {
      ok: false,
      errorCode: ProviderErrorCode.UNKNOWN,
      diagnostics: {
        provider: PROVIDER_NAME,
        reason: "apify_not_configured",
      },
    };
  }

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: linkedinUrl }],
        maxItems: 1,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "";
      }

      return {
        ok: false,
        errorCode: normalizeApifyError(res.status, bodyText),
        diagnostics: {
          provider: PROVIDER_NAME,
          status: res.status,
          responseSnippet: bodyText.slice(0, 200),
        },
      };
    }

    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : data;
    const photoUrl = extractPhotoUrl(item);

    if (!photoUrl) {
      return {
        ok: false,
        errorCode: ProviderErrorCode.NOT_FOUND,
        diagnostics: {
          provider: PROVIDER_NAME,
          reason: "photo_not_found_in_provider_payload",
        },
      };
    }

    return {
      ok: true,
      photoUrl,
      diagnostics: {
        provider: PROVIDER_NAME,
        source: "apify_dataset",
      },
    };
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError";
    return {
      ok: false,
      errorCode: isTimeout
        ? ProviderErrorCode.TIMEOUT
        : ProviderErrorCode.NETWORK,
      diagnostics: {
        provider: PROVIDER_NAME,
        reason: isTimeout ? "apify_timeout" : "apify_network_error",
      },
    };
  }
}
