import type { InvitationEmailConfiguration } from "@/lib/email/types";

const compatibleEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const compatibleFrom = /^(?:[^<>\r\n]+\s)?<([^<>\s]+@[^<>\s]+)>$|^([^<>\s]+@[^<>\s]+)$/;

function isCompatibleFrom(value: string) {
  if (value.includes("\r") || value.includes("\n")) return false;
  const match = compatibleFrom.exec(value);
  return Boolean(match && compatibleEmail.test(match[1] ?? match[2] ?? ""));
}

function isValidPublicBaseUrl(value: string, environment: string) {
  if (!value || value.endsWith("/")) return false;
  try {
    const url = new URL(value);
    return (url.pathname === "" || url.pathname === "/")
      && (environment === "development" ? url.protocol === "http:" || url.protocol === "https:" : url.protocol === "https:");
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
  const environment = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || "development";
  const valid = provider === "resend" && Boolean(apiKey) && Boolean(from) && isCompatibleFrom(from ?? "")
    && (!replyTo || compatibleEmail.test(replyTo)) && Boolean(appBaseUrl) && isValidPublicBaseUrl(appBaseUrl ?? "", environment);

  if (!valid) return { state: required ? "required_unavailable" : "disabled" };
  return { state: "ready", provider: "resend", apiKey: apiKey!, from: from!, replyTo, appBaseUrl: appBaseUrl! };
}
