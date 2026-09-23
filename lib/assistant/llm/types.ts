export type PlannerFailureCode = "not_configured" | "timeout" | "http_error" | "invalid_response";
export type PlannerContext = {
  message: string;
  today: string;
  activeIntent: string | null;
  resolvedSlots: string[];
  missingSlots: string[];
  role: string;
  isProfessional: boolean;
  timeZone: string;
};
export type PlannerProvider = (context: PlannerContext) => Promise<unknown>;

export class PlannerProviderError extends Error {
  readonly code: PlannerFailureCode;
  readonly providerStatus?: number;
  readonly providerErrorType?: string;
  readonly providerErrorCode?: string;
  readonly retryAfter?: string;

  constructor(code: PlannerFailureCode, providerStatus?: number, details: {
    providerErrorType?: string;
    providerErrorCode?: string;
    retryAfter?: string;
  } = {}) {
    super(code);
    this.code = code;
    this.providerStatus = providerStatus;
    this.providerErrorType = details.providerErrorType;
    this.providerErrorCode = details.providerErrorCode;
    this.retryAfter = details.retryAfter;
  }
}
