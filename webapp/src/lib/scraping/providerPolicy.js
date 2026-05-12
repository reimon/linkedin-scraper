import { ProviderErrorCode } from "@/lib/scraping/providers/types";

export const FALLBACK_ELIGIBLE_CODES = new Set([
  ProviderErrorCode.RATE_LIMIT,
  ProviderErrorCode.AUTHWALL,
  ProviderErrorCode.TIMEOUT,
  ProviderErrorCode.NETWORK,
]);

export function shouldFallbackToSecondary(errorCode) {
  return FALLBACK_ELIGIBLE_CODES.has(errorCode);
}
