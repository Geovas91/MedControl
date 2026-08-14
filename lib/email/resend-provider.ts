import "server-only";

import { Resend } from "resend";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/types";
import { classifyResendError } from "@/lib/email/resend-errors";
import { buildResendEmailPayload } from "@/lib/email/resend-payload";

const DELIVERY_TIMEOUT_MS = 12_000;

export async function sendWithResend(configuration: { apiKey: string; from: string; replyTo?: string }, input: SendEmailInput): Promise<SendEmailResult> {
  const resend = new Resend(configuration.apiKey);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      resend.emails.send(
        buildResendEmailPayload(configuration, input),
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
      ),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(Object.assign(new Error("Delivery timeout"), { name: "TimeoutError" })), DELIVERY_TIMEOUT_MS);
      })
    ]);
    if (result.error || !result.data?.id) return { ok: false, code: classifyResendError(result.error) };
    return { ok: true, provider: "resend", messageId: result.data.id };
  } catch (error) {
    return { ok: false, code: classifyResendError(error) };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
