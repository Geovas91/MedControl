import type { InvitationEmailConfiguration } from "@/lib/email/types";

const compatibleEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const compatibleFrom = /^(?:[^<>\r\n]+\s)?<([^<>\s]+@[^<>\s]+)>$|^([^<>\s]+@[^<>\s]+)$/;

function isCompatibleFrom(value: string) {
  if (value.includes("\r") || value.includes("\n")) return false;
  const match = compatibleFrom.exec(value);
  return Boolean(match && compatibleEmail.test(match[1] ?? match[2] ?? ""));
}

function isLocalDevelopmentHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isValidPublicBaseUrl(value: string, nodeEnvironment: string | undefined) {
  if (!value || value.endsWith("/")) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/") || !url.hostname) return false;
    const localEnvironment = nodeEnvironment === "development" || nodeEnvironment === "test";
    if (url.protocol === "https:") return localEnvironment || !isLocalDevelopmentHost(url.hostname);
    return localEnvironment && url.protocol === "http:" && isLocalDevelopmentHost(url.hostname);
  } catch {
    return false;
  }
}

export function getInvitationEmailConfiguration(): InvitationEmailConfiguration {
  const required = process.env.EMAIL_REQUIRED === "true";
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  const valid = provider === "resend" && Boolean(apiKey) && Boolean(from) && isCompatibleFrom(from ?? "")
    && (!replyTo || compatibleEmail.test(replyTo)) && Boolean(appBaseUrl) && isValidPublicBaseUrl(appBaseUrl ?? "", process.env.NODE_ENV)
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!valid) return { state: required ? "required_unavailable" : "disabled" };
  return { state: "ready", provider: "resend", apiKey: apiKey!, from: from!, replyTo, appBaseUrl: appBaseUrl! };
}
