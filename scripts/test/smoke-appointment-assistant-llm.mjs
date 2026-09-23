// Suppress the planner's safe operational logger in this one-off CLI so stdout
// contains only the requested aggregate smoke report.
const write = console.log.bind(console);
const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
console.log = console.info = console.warn = console.error = () => {};
process.on("warning", () => {});

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== "--run") {
  Object.assign(console, original);
  write("Sin llamadas. Ejecuta con --run desde PowerShell para enviar los cinco casos sintéticos.");
  process.exitCode = args.length ? 2 : 0;
} else {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.APPOINTMENT_ASSISTANT_LLM_MODEL?.trim() || "gpt-6-luna";
  if (!apiKey) {
    Object.assign(console, original);
    write("OPENAI_API_KEY=NOT SET; no se hicieron llamadas.");
    process.exitCode = 2;
  } else {
    const [{ requestOpenAiPlanner }, { PlannerProviderError }, { planAssistantConversation }, { parseAssistantIntentDraft }, { isCanonicalAppointmentUuid }] = await Promise.all([
      import("../../lib/assistant/llm/transport.ts"),
      import("../../lib/assistant/llm/types.ts"),
      import("../../lib/assistant/llm/planner.ts"),
      import("../../lib/assistant/llm/contracts.ts"),
      import("../../lib/appointments/query.ts")
    ]);
    const { getClinicDayRange } = await import("../../lib/dashboard/timezone.ts");
    const today = getClinicDayRange("America/Mexico_City").localDate;
    const common = { today, pending: null, role: "owner", isProfessional: false, timeZone: "America/Mexico_City", enabled: true };
    const cases = [
      { id: "A", prompt: "Agenda una cita mañana a las 4", expected: "create_appointment" },
      { id: "B", prompt: "Dame mis citas de hoy", expected: "search_appointments" },
      { id: "C", prompt: "Quiero cancelar mi cita de mañana", expected: "cancel_appointment" },
      { id: "D", prompt: "Agenda a QA Patient N-D1-01 con QA Doctor 1 Norte mañana a las 15:30", expected: "create_appointment" },
      { id: "E", prompt: "¿Cuál es la capital de Francia?", expected: "unknown" }
    ];
    const results = [];
    let calls = 0;

    for (const item of cases) {
      const startedAt = Date.now();
      let metadata = null;
      let safeStatus = "not_called";
      let errorType = "unknown";
      let errorCode = "unknown";
      let retryAfter = "none";
      let providerFailed = false;
      let validSchema = false;
      let resultingIntent = "unknown";
      try {
        const planned = await planAssistantConversation({
          ...common,
          message: item.prompt,
          provider: async (context) => {
            calls += 1;
            try {
              metadata = await requestOpenAiPlanner({ context, apiKey, model });
              safeStatus = `HTTP ${metadata.httpStatus}`;
              validSchema = parseAssistantIntentDraft(metadata.draft) !== null;
              return metadata.draft;
            } catch (error) {
              const code = error instanceof PlannerProviderError ? error.code : "provider_error";
              const status = error instanceof PlannerProviderError && error.providerStatus ? `/${error.providerStatus}` : "";
              safeStatus = `${code}${status}`;
              providerFailed = true;
              if (error instanceof PlannerProviderError) {
                errorType = error.providerErrorType ?? "unknown";
                errorCode = error.providerErrorCode ?? "unknown";
                retryAfter = error.retryAfter ?? "none";
              }
              throw error;
            }
          }
        });
        const intent = planned.state === "parsed" && planned.result.state === "intent" ? planned.result.intent : null;
        resultingIntent = metadata ? intent?.type ?? "unknown" : "unknown";
        const noCanonicalIds = item.id !== "D" || (validSchema && intent !== null && !Object.entries(intent).some(([key, value]) => /id$/i.test(key) && typeof value === "string" && isCanonicalAppointmentUuid(value)));
        const queryDraft = metadata ? metadata.draft : null;
        const dHasQueries = item.id !== "D" || (queryDraft && typeof queryDraft === "object" && typeof queryDraft.patientQuery === "string" && typeof queryDraft.professionalQuery === "string");
        const expectedIntent = item.id === "E" ? (!intent && validSchema && queryDraft?.intent === "unknown") : resultingIntent === item.expected;
        const pass = Boolean(metadata) && safeStatus.startsWith("HTTP 2") && validSchema && expectedIntent && noCanonicalIds && dHasQueries;
        results.push({ id: item.id, pass, intent: item.id === "E" ? (pass ? "unknown/non_action" : resultingIntent) : resultingIntent, metadata, latency: Date.now() - startedAt, safeStatus: validSchema || providerFailed ? safeStatus : `${safeStatus};invalid_structured_output`, errorType, errorCode, retryAfter });
      } catch (error) {
        const code = error instanceof PlannerProviderError ? error.code : "provider_error";
        const status = error instanceof PlannerProviderError && error.providerStatus ? `/${error.providerStatus}` : "";
        safeStatus = `${code}${status}`;
        if (error instanceof PlannerProviderError) {
          errorType = error.providerErrorType ?? "unknown";
          errorCode = error.providerErrorCode ?? "unknown";
          retryAfter = error.retryAfter ?? "none";
        }
        results.push({ id: item.id, pass: false, intent: "unknown", metadata, latency: Date.now() - startedAt, safeStatus, errorType, errorCode, retryAfter });
      }
    }

    Object.assign(console, original);
    const inputTokens = results.reduce((sum, row) => sum + (row.metadata?.usage.inputTokens ?? 0), 0);
    const outputTokens = results.reduce((sum, row) => sum + (row.metadata?.usage.outputTokens ?? 0), 0);
    const totalTokens = results.reduce((sum, row) => sum + (row.metadata?.usage.totalTokens ?? 0), 0);
    const cachedInputTokens = results.reduce((sum, row) => sum + (row.metadata?.usage.cachedInputTokens ?? 0), 0);
    const successes = results.filter((row) => row.pass).length;
    const failures = results.length - successes;
    const latencyTotal = results.reduce((sum, row) => sum + row.latency, 0);
    const costUsd = ((inputTokens - cachedInputTokens) * 0.10 + cachedInputTokens * 0.01 + outputTokens * 0.50) / 1_000_000;

    for (const row of results) {
      write(`case=${row.id} result=${row.pass ? "PASS" : "FAIL"} intent=${row.intent} input_tokens=${row.metadata?.usage.inputTokens ?? 0} output_tokens=${row.metadata?.usage.outputTokens ?? 0} total_tokens=${row.metadata?.usage.totalTokens ?? 0} latency_ms=${row.latency} provider=${row.safeStatus} error_type=${row.errorType ?? "unknown"} error_code=${row.errorCode ?? "unknown"} retry_after=${row.retryAfter ?? "none"}`);
    }
    write(`total_calls=${calls} successes=${successes} failures=${failures} input_tokens_total=${inputTokens} output_tokens_total=${outputTokens} total_tokens=${totalTokens} estimated_cost_usd=${costUsd.toFixed(8)} average_latency_ms=${Math.round(latencyTotal / results.length)}`);
    if (failures) process.exitCode = 1;
  }
}
