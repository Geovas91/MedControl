import { DEFAULT_ASSISTANT_LLM_RATE_LIMIT_MAX, DEFAULT_ASSISTANT_LLM_RATE_LIMIT_WINDOW_SECONDS } from "./domain-gate";

type RateLimitEntry = { timestamps: number[]; touchedAt: number };
export type AssistantLlmRateLimitConfig = { maxRequests: number; windowMs: number };

export function getAssistantLlmRateLimitConfig(maxValue: string | undefined, windowSecondsValue: string | undefined): AssistantLlmRateLimitConfig {
  const parse = (value: string | undefined, fallback: number, max: number) => value && /^\d+$/.test(value) ? Math.min(max, Math.max(1, Number(value))) : fallback;
  return {
    maxRequests: parse(maxValue, DEFAULT_ASSISTANT_LLM_RATE_LIMIT_MAX, 1000),
    windowMs: parse(windowSecondsValue, DEFAULT_ASSISTANT_LLM_RATE_LIMIT_WINDOW_SECONDS, 3600) * 1000
  };
}

/** Process-local limiter; bounded to avoid unbounded memory growth on long-lived workers. */
export function createAssistantLlmRateLimiter({ maxEntries = 5000 }: { maxEntries?: number } = {}) {
  const entries = new Map<string, RateLimitEntry>();
  return {
    consume({ clinicId, actorId, now = Date.now(), maxRequests, windowMs }: { clinicId: string; actorId: string; now?: number; maxRequests: number; windowMs: number }) {
      const key = `${clinicId}:${actorId}`;
      const cutoff = now - windowMs;
      for (const [entryKey, entry] of entries) {
        entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > cutoff);
        if (!entry.timestamps.length) entries.delete(entryKey);
      }
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= maxEntries) {
          const oldestKey = [...entries.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0]?.[0];
          if (oldestKey) entries.delete(oldestKey);
        }
        entry = { timestamps: [], touchedAt: now };
        entries.set(key, entry);
      }
      if (entry.timestamps.length >= maxRequests) return false;
      entry.timestamps.push(now);
      entry.touchedAt = now;
      return true;
    },
    clear() { entries.clear(); }
  };
}

export const assistantLlmRateLimiter = createAssistantLlmRateLimiter();
