import "server-only";

import { DeterministicSupportAssistantProvider, classifySupportIntent } from "@/lib/support/assistant";
import { canReadSupportArticle, searchPublishedSupportArticles, toSupportArticleReference } from "@/lib/support/articles";
import { normalizeSupportText } from "@/lib/support/security";
import { loadCanonicalSupportArticles } from "@/lib/server/support/articles";
import { getSupportContext } from "@/lib/server/support/context";
import { runSupportDiagnostic } from "@/lib/server/support/diagnostics";

export const SUPPORT_QUESTION_MAX_LENGTH = 300;

const intentArticleSlugs = {
  create_appointment: ["crear-una-cita"],
  reschedule_appointment: ["reprogramar-una-cita"],
  cancel_appointment: ["cancelar-una-cita"],
  google_calendar_problem: ["conectar-google-calendar"],
  appointment_assistant_problem: ["asistente-de-agenda"]
} as const;

export async function answerSupportQuestion(questionInput: string) {
  const question = normalizeSupportText(questionInput, SUPPORT_QUESTION_MAX_LENGTH);
  if (!question) return { state: "invalid_input" as const, data: null };
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };

  const visible = (await loadCanonicalSupportArticles()).filter((article) => canReadSupportArticle(article, contextResult.context));
  const rule = classifySupportIntent(question);
  const preferredSlugs: readonly string[] = intentArticleSlugs[rule.intent as keyof typeof intentArticleSlugs] ?? [];
  const lexical = searchPublishedSupportArticles(visible, question);
  const articles = [...visible.filter((article) => preferredSlugs.includes(article.slug)), ...lexical]
    .filter((article, index, all) => all.findIndex((candidate) => candidate.slug === article.slug) === index)
    .slice(0, 5)
    .map(toSupportArticleReference);

  const diagnostics = [];
  if (rule.intent !== "clinical_question") {
    for (const diagnosticId of rule.diagnosticIds.slice(0, 1)) {
      const diagnostic = await runSupportDiagnostic(diagnosticId);
      if (diagnostic.state === "rate_limited") return { state: "rate_limited" as const, data: null };
      if (diagnostic.state === "ready") diagnostics.push(diagnostic.data);
    }
  }

  const provider = new DeterministicSupportAssistantProvider();
  return { state: "ready" as const, data: await provider.answer({ question, articles, diagnostics }) };
}
