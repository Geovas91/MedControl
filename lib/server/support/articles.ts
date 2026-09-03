import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { getSupportContext } from "@/lib/server/support/context";
import { canReadSupportArticle, isSupportArticleSlug, searchPublishedSupportArticles } from "@/lib/support/articles";
import { validateSupportArticleMarkdown, type SupportArticleDocument } from "@/lib/support/content";
import { buildSupportLogContext } from "@/lib/support/security";

const supportContentDirectory = path.join(process.cwd(), "content", "support", "es");

export async function loadCanonicalSupportArticles(): Promise<SupportArticleDocument[]> {
  const names = (await readdir(supportContentDirectory)).filter((name) => name.endsWith(".md")).sort();
  const articles: SupportArticleDocument[] = [];
  for (const name of names) {
    const source = await readFile(path.join(supportContentDirectory, name), "utf8");
    const result = validateSupportArticleMarkdown(source);
    if (!result.ok) throw new Error(`Invalid support article ${name}: ${result.code}`);
    articles.push(result.article);
  }
  return articles;
}

export async function listVisibleSupportArticles() {
  const contextResult = await getSupportContext();
  if (contextResult.state !== "ready") return { state: contextResult.state, data: null };
  const articles = (await loadCanonicalSupportArticles()).filter((article) => canReadSupportArticle(article, contextResult.context));
  return { state: "ready" as const, data: articles };
}

export async function searchVisibleSupportArticles(query: string) {
  const visible = await listVisibleSupportArticles();
  if (visible.state !== "ready") return visible;
  const data = searchPublishedSupportArticles(visible.data, query);
  logger.info("Support knowledge base searched", buildSupportLogContext({ operation: "kb_search", status: "success", code: data.length ? "results_found" : "no_results" }));
  return { state: "ready" as const, data };
}

export async function getVisibleSupportArticle(slug: string) {
  if (!isSupportArticleSlug(slug)) return { state: "not_found" as const, data: null };
  const visible = await listVisibleSupportArticles();
  if (visible.state !== "ready") return visible;
  const article = visible.data.find((candidate) => candidate.slug === slug);
  return article ? { state: "ready" as const, data: article } : { state: "not_found" as const, data: null };
}
