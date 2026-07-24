export type InvitationEmailDeliveryStatus = "sent" | "failed" | "disabled";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; provider: "resend"; messageId: string }
  | { ok: false; code: "disabled" | "misconfigured" | "provider_error" | "rate_limited" | "timeout" };

export type InvitationEmailConfiguration =
  | { state: "ready"; provider: "resend"; apiKey: string; from: string; replyTo?: string; appBaseUrl: string }
  | { state: "disabled" | "required_unavailable" };
