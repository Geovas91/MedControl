export const APPOINTMENT_AUTOMATION_LIVE_POLL_INTERVAL_MS = 20_000;
export const APPOINTMENT_AUTOMATION_HEARTBEAT_STALE_MS = 5 * 60_000;
export const APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT = 10;

const jobTypes = ["reminder_email", "review_request_email", "reminder_whatsapp"] as const;
const jobStatuses = ["pending", "processing", "retry_pending", "succeeded", "skipped", "failed", "cancelled"] as const;
const schedulerStatuses = ["running", "ok", "error"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCodePattern = /^[a-z0-9_]{1,64}$/;

export type AppointmentAutomationLiveJob = {
  id: string;
  type: (typeof jobTypes)[number];
  status: (typeof jobStatuses)[number];
  scheduledFor: string;
  attempts: number;
  maxAttempts: number;
  lastErrorCode: string | null;
  appointmentId: string;
};

export type AppointmentAutomationLiveStatus = {
  scheduler: {
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    status: (typeof schedulerStatuses)[number] | null;
    label: "Configuración incompleta" | "Sin señal" | "Scheduler OK";
  };
  jobs: AppointmentAutomationLiveJob[];
  refreshedAt: string;
};

export type AppointmentAutomationDashboardSource = {
  job_id: unknown;
  job_type: unknown;
  job_status: unknown;
  scheduled_for: unknown;
  attempts: unknown;
  max_attempts: unknown;
  last_error_code: unknown;
  appointment_id: unknown;
};

export type AppointmentAutomationSchedulerSource = {
  last_started_at: unknown;
  last_completed_at: unknown;
  last_status: unknown;
} | null;

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function safeIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function sanitizeAppointmentAutomationCode(value: unknown) {
  if (value === null || value === undefined) return null;
  return typeof value === "string" && safeCodePattern.test(value) ? value : "operation_error";
}

export function getAppointmentAutomationSchedulerLabel(input: {
  cronConfigured: boolean;
  lastCompletedAt: string | null;
  status: string | null;
  now?: number;
}): AppointmentAutomationLiveStatus["scheduler"]["label"] {
  if (!input.cronConfigured) return "Configuración incompleta";
  const completedAt = input.lastCompletedAt ? Date.parse(input.lastCompletedAt) : Number.NaN;
  if (!Number.isFinite(completedAt) || (input.now ?? Date.now()) - completedAt > APPOINTMENT_AUTOMATION_HEARTBEAT_STALE_MS) {
    return "Sin señal";
  }
  return input.status === "ok" ? "Scheduler OK" : "Sin señal";
}

export function buildAppointmentAutomationLiveStatus(input: {
  scheduler: AppointmentAutomationSchedulerSource;
  jobs: AppointmentAutomationDashboardSource[];
  cronConfigured: boolean;
  now?: Date;
}): AppointmentAutomationLiveStatus {
  const now = input.now ?? new Date();
  const lastStartedAt = safeIso(input.scheduler?.last_started_at);
  const lastCompletedAt = safeIso(input.scheduler?.last_completed_at);
  const status = isOneOf(input.scheduler?.last_status, schedulerStatuses) ? input.scheduler.last_status : null;
  const jobs = input.jobs.slice(0, APPOINTMENT_AUTOMATION_LIVE_JOB_LIMIT).flatMap((job) => {
    if (
      typeof job.job_id !== "string" || !uuidPattern.test(job.job_id) ||
      typeof job.appointment_id !== "string" || !uuidPattern.test(job.appointment_id) ||
      !isOneOf(job.job_type, jobTypes) || !isOneOf(job.job_status, jobStatuses) ||
      !safeIso(job.scheduled_for) || !Number.isInteger(job.attempts) || !Number.isInteger(job.max_attempts) ||
      (job.attempts as number) < 0 || (job.max_attempts as number) < 1 || (job.attempts as number) > (job.max_attempts as number)
    ) return [];

    return [{
      id: job.job_id,
      type: job.job_type,
      status: job.job_status,
      scheduledFor: job.scheduled_for as string,
      attempts: job.attempts as number,
      maxAttempts: job.max_attempts as number,
      lastErrorCode: sanitizeAppointmentAutomationCode(job.last_error_code),
      appointmentId: job.appointment_id
    }];
  });

  return {
    scheduler: {
      lastStartedAt,
      lastCompletedAt,
      status,
      label: getAppointmentAutomationSchedulerLabel({
        cronConfigured: input.cronConfigured,
        lastCompletedAt,
        status,
        now: now.getTime()
      })
    },
    jobs,
    refreshedAt: now.toISOString()
  };
}

export function parseAppointmentAutomationLiveStatus(value: unknown): AppointmentAutomationLiveStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const scheduler = candidate.scheduler as Record<string, unknown> | undefined;
  if (!scheduler || !Array.isArray(candidate.jobs) || !safeIso(candidate.refreshedAt)) return null;
  if (!isOneOf(scheduler.label, ["Configuración incompleta", "Sin señal", "Scheduler OK"] as const)) return null;
  const rebuilt = buildAppointmentAutomationLiveStatus({
    scheduler: {
      last_started_at: scheduler.lastStartedAt,
      last_completed_at: scheduler.lastCompletedAt,
      last_status: scheduler.status
    },
    jobs: candidate.jobs.map((job) => {
      const row = (job ?? {}) as Record<string, unknown>;
      return {
        job_id: row.id,
        job_type: row.type,
        job_status: row.status,
        scheduled_for: row.scheduledFor,
        attempts: row.attempts,
        max_attempts: row.maxAttempts,
        last_error_code: row.lastErrorCode,
        appointment_id: row.appointmentId
      };
    }),
    cronConfigured: scheduler.label !== "Configuración incompleta",
    now: new Date(candidate.refreshedAt as string)
  });
  if (rebuilt.jobs.length !== candidate.jobs.length) return null;
  return {
    ...rebuilt,
    scheduler: { ...rebuilt.scheduler, label: scheduler.label },
    refreshedAt: candidate.refreshedAt as string
  };
}

export function canViewAppointmentAutomationLiveStatus(role: string) {
  return role === "owner" || role === "admin" || role === "doctor" || role === "assistant";
}
