import { supportDiagnosticIds, type SafeDiagnosticResult, type SupportContext, type SupportDiagnosticId } from "./types.ts";
import { isSafeSupportCode } from "./security.ts";

export type SupportDiagnosticHandler = (context: SupportContext, verifiedAt: string) => Promise<SafeDiagnosticResult>;
export type SupportDiagnosticRegistry = Readonly<Record<SupportDiagnosticId, SupportDiagnosticHandler>>;

export function isSupportDiagnosticId(value: string): value is SupportDiagnosticId {
  return supportDiagnosticIds.includes(value as SupportDiagnosticId);
}

export function safeDiagnosticResult(input: SafeDiagnosticResult): SafeDiagnosticResult {
  if (!isSupportDiagnosticId(input.diagnosticId) || !isSafeSupportCode(input.code) || !Number.isFinite(Date.parse(input.verifiedAt))) {
    throw new Error("Unsafe support diagnostic result");
  }
  return {
    diagnosticId: input.diagnosticId,
    status: input.status,
    code: input.code,
    verifiedAt: new Date(input.verifiedAt).toISOString(),
    suggestedArticleSlugs: input.suggestedArticleSlugs.filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).slice(0, 5)
  };
}

export function createStaticDiagnosticRegistry(handlers: SupportDiagnosticRegistry) {
  return Object.freeze({ ...handlers });
}

export async function executeRegisteredDiagnostic(registry: SupportDiagnosticRegistry, diagnosticId: string, context: SupportContext, now = new Date()) {
  if (!isSupportDiagnosticId(diagnosticId)) return null;
  return safeDiagnosticResult(await registry[diagnosticId](context, now.toISOString()));
}
