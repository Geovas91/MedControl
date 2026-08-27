import { isReviewToken } from "./token.ts";

export function buildReviewUrl(baseUrl: string, token: string) {
  if (!isReviewToken(token)) throw new Error("Invalid review token.");
  return new URL(`/review/${token}`, baseUrl).toString();
}

export function extractReviewToken(reviewUrl: string, baseUrl: string) {
  try {
    const candidate = new URL(reviewUrl);
    const canonical = new URL(baseUrl);
    if (candidate.origin !== canonical.origin || candidate.search || candidate.hash) return null;
    const match = /^\/review\/([^/]+)$/.exec(candidate.pathname);
    const token = match?.[1] ?? "";
    return isReviewToken(token) ? token : null;
  } catch {
    return null;
  }
}
