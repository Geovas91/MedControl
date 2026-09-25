import { getMissingFields, applyFollowUpToIntent } from "@/lib/assistant/orchestration/conversation";
import type { AssistantIntent } from "@/lib/assistant/orchestration/intents";
import { parseAssistantText, parseDateExpression, parseTimeExpression, type ParserResult } from "@/lib/assistant/parser/deterministic";

export const ASSISTANT_DOMAIN_REPLY = "Puedo ayudarte únicamente con la gestión de citas y disponibilidad de la agenda. Puedes pedirme agendar, consultar, reprogramar o cancelar una cita.";
export const ASSISTANT_RATE_LIMIT_REPLY = "Alcanzaste temporalmente el límite de consultas del asistente. Intenta de nuevo más tarde.";
export const DEFAULT_ASSISTANT_LLM_MAX_INPUT_CHARS = 500;
export const DEFAULT_ASSISTANT_LLM_RATE_LIMIT_MAX = 20;
export const DEFAULT_ASSISTANT_LLM_RATE_LIMIT_WINDOW_SECONDS = 60;

export type AssistantDomainGateResult =
  | { state: "allowed"; message: string; reasonCode: "recognized_intent" | "scheduling_language" | "contextual_follow_up"; intentCategory: string }
  | { state: "rejected"; reasonCode: "no_scheduling_signal" | "prompt_injection_only"; intentCategory: string }
  | { state: "too_long"; reasonCode: "input_too_long"; intentCategory: string };

const weekday = "lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo";
const injectionPatterns = [
  /\bignora(?:r)?\s+(?:(?:todas?|tus|las|anteriores)\s+)*(?:instrucciones|reglas|indicaciones)(?:\s+(?:del|de)\s+sistema)?\b/gi,
  /\bact[uú]a\s+como\s+(?:chatgpt|un asistente general|un modelo sin restricciones)\b/gi,
  /\bmu[eé]strame\s+(?:tu|el)\s+prompt\b/gi,
  /\b(?:haz cualquier otra cosa|revela el prompt del sistema|ignore (?:all )?(?:previous|system) instructions)\b/gi
];
const offDomainPatterns = [
  /\bchiste\b/i, /\bcapital\s+de\b/i, /\b(?:expl[ií]ca|expl[ií]came|qu[eé]\s+es)\b.{0,50}\b(?:diabetes|enfermedad|medicamento|s[ií]ntoma|diagn[oó]stico)\b/i,
  /\b(?:hazme|dame|escr[ií]beme|rec[eé]tame)\s+(?:una?\s+)?receta\b/i, /\b(?:escribe|redacta|escr[ií]beme)\s+(?:un|una|el|la)?\s*(?:correo|email|mensaje)\b/i,
  /\b(?:resume|res[uú]meme)\s+(?:este|el|la)\s+(?:documento|archivo|texto)\b/i, /\b(?:qui[eé]n|quien)\s+gan[oó]\s+(?:el\s+)?(?:mundial|partido|juego)\b/i,
  /\b(?:programa|programar|programo|programando|c[oó]mo\s+programo)\b.{0,30}\b(?:python|javascript|c[oó]digo|api)\b/i
];

function normalize(value: string) { return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim(); }
function stripInjectionDirectives(value: string) {
  let output = value;
  for (const pattern of injectionPatterns) output = output.replace(pattern, " ");
  return output.replace(/\s+([,;.!?])/g, "$1").replace(/\s+/g, " ").trim();
}
function extractSchedulingClauses(value: string, today: string) {
  const parts = value.split(/(?:[.!?;\n]+|\s+(?:y|pero|adem[aá]s|tambi[eé]n)\s+)/i)
    .map((part) => part.replace(/^\s*(?:y|pero|adem[aá]s|tambi[eé]n)\s+/i, "").trim())
    .filter(Boolean);
  const kept = parts.filter((part) => parsedIntent(parseAssistantText(part, today)) !== null || hasNaturalSchedulingSignal(part));
  return kept.join(" y ");
}
function parsedIntent(result: ParserResult): AssistantIntent | null {
  if (result.state === "intent") return result.intent;
  if (result.state === "needs_input") return result.intent ?? null;
  return null;
}
function hasNaturalSchedulingSignal(value: string) {
  const plain = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const professional = /\b(?:doctores?|doctoras?|medicos?|medicas?|profesionales?|especialistas?)\b/.test(plain);
  const patient = /\bpacientes?\b/.test(plain);
  const appointment = /\b(?:citas?|agenda|agendar|agendamiento|reservar|reservacion|turnos?|confirmar|cancelar|reprogramar|reprograma|reagendar)\b/.test(plain);
  const availability = /\b(?:disponibles?|disponibilidad|libres?|horarios?|horas?)\b/.test(plain);
  const schedulingAction = /\b(?:atender|atiende|atencion|buscar|busca|busco|encuentra|muestra|muestrame|ver|lista|puede atender|puedo agendar|con quien|hay|estan|tiene|tienen)\b/.test(plain);
  const directorySearch = /\b(?:buscar|busca|busco|encuentra|muestra|muestrame|lista)\b/.test(plain);
  const timeContext = parseDateExpression(value, "2026-01-01") !== null || parseTimeExpression(value) !== null || new RegExp(`\\b(?:${weekday}|hoy|manana)\\b`).test(plain);

  return appointment
    || professional && (schedulingAction || availability)
    || patient && schedulingAction
    || availability
    || directorySearch
    || schedulingAction && timeContext
    || /\balgo\s+(?:libre|disponible)\b/.test(plain) && timeContext
    || /\b(?:a\s+que\s+hora\s+viene|que\s+hora\s+tiene)\b/.test(plain);
}
function plausibleSlotFollowUp(value: string) {
  const plain = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (parseDateExpression(value, "2026-01-01") || parseTimeExpression(value)) return true;
  if (/^(?:ese horario|esa hora|ese|esa|el primero|la primera|el segundo|la segunda|otro|otra|ninguno|ninguna|sí|si|no)$/.test(plain)) return true;
  if (/\b(?:agenda|agendar|cita|citas|horarios?|disponibilidad|cancelar|cancela|reprogramar|reprograma|confirmar|confirma|ver|muestra)\b/i.test(plain)) return false;
  return value.length <= 100 && !/[?¿]/.test(value) && /^[\p{L}\p{M}\d][\p{L}\p{M}\d .'-]*$/u.test(value);
}

export function getAssistantLlmMaxInputChars(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return DEFAULT_ASSISTANT_LLM_MAX_INPUT_CHARS;
  return Math.min(2000, Math.max(100, Number(value)));
}

export function evaluateAssistantDomainGate({ message, today, pending, maxInputChars = DEFAULT_ASSISTANT_LLM_MAX_INPUT_CHARS }: { message: string; today: string; pending: AssistantIntent | null; maxInputChars?: number }): AssistantDomainGateResult {
  const intentCategory = pending?.type ?? "unknown";
  if (message.length > maxInputChars) return { state: "too_long", reasonCode: "input_too_long", intentCategory };
  const normalized = normalize(message);
  const injectionDetected = injectionPatterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(normalized); });
  let safeMessage = injectionDetected ? stripInjectionDirectives(normalized) : normalized;
  let parsed = parsedIntent(parseAssistantText(safeMessage, today));
  const parsedCategory = parsed?.type ?? "unknown";
  if (offDomainPatterns.some((pattern) => pattern.test(safeMessage))) {
    safeMessage = extractSchedulingClauses(safeMessage, today);
    parsed = parsedIntent(parseAssistantText(safeMessage, today));
    if (!safeMessage) return { state: "rejected", reasonCode: injectionDetected ? "prompt_injection_only" : "no_scheduling_signal", intentCategory: "unknown" };
  }
  const safeCategory = parsed?.type ?? "unknown";
  if (pending && parsed?.type !== pending.type && getMissingFields(pending).length > 0 && plausibleSlotFollowUp(safeMessage)) {
    return { state: "allowed", message: safeMessage, reasonCode: "contextual_follow_up", intentCategory: pending.type };
  }
  if (parsed) return { state: "allowed", message: safeMessage, reasonCode: "recognized_intent", intentCategory: safeCategory };
  if (hasNaturalSchedulingSignal(safeMessage)) return { state: "allowed", message: safeMessage, reasonCode: "scheduling_language", intentCategory: "unknown" };
  if (injectionDetected && !safeMessage) return { state: "rejected", reasonCode: "prompt_injection_only", intentCategory: "unknown" };
  if (pending) {
    const followUp = applyFollowUpToIntent({ intent: pending, message: safeMessage, clinicLocalDate: today });
    if (followUp.consumed || plausibleSlotFollowUp(safeMessage) && getMissingFields(pending).length > 0) return { state: "allowed", message: safeMessage, reasonCode: "contextual_follow_up", intentCategory: pending.type };
  }
  return { state: "rejected", reasonCode: injectionDetected ? "prompt_injection_only" : "no_scheduling_signal", intentCategory: parsedCategory };
}
