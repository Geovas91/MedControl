import type { SupportArticleDocument } from "./content.ts";
import type { SupportArticleReference, SupportContext } from "./types.ts";

export const SUPPORT_SEARCH_MAX_LENGTH = 160;
export const SUPPORT_SEARCH_RESULT_LIMIT = 8;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX").replace(/[^a-z0-9]+/g, " ").trim();
}

export function isSupportArticleSlug(value: string) {
  return slugPattern.test(value);
}

export function getSupportArticleSummary(article: SupportArticleDocument) {
  const paragraph = article.bodyMarkdown
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#{1,6}\s+/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").trim())
    .find((part) => part && !part.startsWith("#"));
  return (paragraph ?? article.title).slice(0, 240);
}

export function canReadSupportArticle(article: SupportArticleDocument, context: SupportContext) {
  return article.status === "published"
    && article.audienceRoles.includes(context.role)
    && article.requiredFeatures.every((feature) => context.entitlements[feature as keyof SupportContext["entitlements"]] === true);
}

export function toSupportArticleReference(article: SupportArticleDocument): SupportArticleReference {
  return { slug: article.slug, title: article.title, summary: getSupportArticleSummary(article), version: article.version };
}

export function searchPublishedSupportArticles(articles: SupportArticleDocument[], query: string, limit = SUPPORT_SEARCH_RESULT_LIMIT) {
  const bounded = query.trim().slice(0, SUPPORT_SEARCH_MAX_LENGTH);
  if (!bounded) return articles.slice(0, limit);
  const terms = normalize(bounded).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return articles
    .filter((article) => article.status === "published")
    .map((article) => {
      const title = normalize(article.title);
      const summary = normalize(getSupportArticleSummary(article));
      const document = normalize(article.bodyMarkdown);
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 100 : 0) + (summary.includes(term) ? 10 : 0) + (document.includes(term) ? 1 : 0), 0);
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title, "es"))
    .slice(0, Math.max(0, Math.min(limit, SUPPORT_SEARCH_RESULT_LIMIT)))
    .map((item) => item.article);
}
