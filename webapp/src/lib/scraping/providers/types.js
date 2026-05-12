export const ProviderErrorCode = {
  RATE_LIMIT: "RATE_LIMIT",
  AUTHWALL: "AUTHWALL",
  NOT_FOUND: "NOT_FOUND",
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  UNKNOWN: "UNKNOWN",
};

export class ProviderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.details = details;
  }
}
