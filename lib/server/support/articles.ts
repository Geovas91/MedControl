import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateSupportArticleMarkdown, type SupportArticleDocument } from "@/lib/support/content";

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
