import type { SendEmailInput } from "./types";

export function buildResendEmailPayload(
  configuration: { from: string; replyTo?: string },
  input: SendEmailInput
) {
  return {
    from: configuration.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo ?? configuration.replyTo,
    attachments: input.attachments
  };
}
