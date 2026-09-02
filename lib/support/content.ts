import type { SupportRole } from "@/lib/support/types";

export type SupportArticleDocument = {
  slug: string;
  title: string;
  category: string;
  version: number;
  status: "draft" | "review" | "published" | "retired";
  audienceRoles: SupportRole[];
  requiredFeatures: string[];
  clinicalContent: false;
  bodyMarkdown: string;
};

export type SupportArticleValidation =
  | { ok: true; article: SupportArticleDocument }
  | { ok: false; code: string };

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const featurePattern = /^[a-z][a-z0-9_]{0,63}$/;
const roles: SupportRole[] = ["owner", "admin", "doctor", "assistant"];
const statuses = ["draft", "review", "published", "retired"] as const;
const rawHtmlPattern = /<\/?[a-z!][^>]*>/i;
const unsafeSchemePattern = /(?:javascript|data|vbscript):/i;

function parseArray(value: string) {
  if (!value.startsWith("[") || !value.endsWith("]")) return null;
  const inner = value.slice(1, -1).trim();
  return inner ? inner.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function parseFrontmatter(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const entries = normalized.slice(4, end).split("\n");
  const metadata: Record<string, string> = {};
  for (const line of entries) {
    const separator = line.indexOf(":");
    if (separator <= 0) return null;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || key in metadata) return null;
    metadata[key] = value;
  }
  return { metadata, body: normalized.slice(end + 5).trim() };
}

function markdownLinksAreSafe(body: string) {
  if (/!\[[^\]]*\]\s*\(/.test(body)) return false;
  const links = body.matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  for (const match of links) {
    const target = match[1];
    if (!(target.startsWith("/dashboard/") || target.startsWith("https://clinicontrol.mx/"))) return false;
  }
  return true;
}

export function validateSupportArticleMarkdown(source: string): SupportArticleValidation {
  const parsed = parseFrontmatter(source);
  if (!parsed) return { ok: false, code: "invalid_frontmatter" };
  const { metadata, body } = parsed;
  const expectedKeys = ["slug", "title", "category", "version", "status", "audience_roles", "required_features", "clinical_content"];
  if (Object.keys(metadata).length !== expectedKeys.length || expectedKeys.some((key) => !(key in metadata))) {
    return { ok: false, code: "invalid_frontmatter_fields" };
  }
  if (!slugPattern.test(metadata.slug) || !slugPattern.test(metadata.category)) return { ok: false, code: "invalid_slug" };
  const version = Number(metadata.version);
  if (!Number.isSafeInteger(version) || version < 1) return { ok: false, code: "invalid_version" };
  if (!statuses.includes(metadata.status as (typeof statuses)[number])) return { ok: false, code: "invalid_status" };
  const audienceRoles = parseArray(metadata.audience_roles);
  const requiredFeatures = parseArray(metadata.required_features);
  if (!audienceRoles?.length || audienceRoles.some((role) => !roles.includes(role as SupportRole))) return { ok: false, code: "invalid_audience_roles" };
  if (!requiredFeatures || requiredFeatures.some((feature) => !featurePattern.test(feature))) return { ok: false, code: "invalid_required_features" };
  if (metadata.clinical_content !== "false") return { ok: false, code: "clinical_content_not_allowed" };
  if (!metadata.title || metadata.title.length > 160 || !body || body.length > 20_000) return { ok: false, code: "invalid_content_length" };
  if (rawHtmlPattern.test(body)) return { ok: false, code: "raw_html_not_allowed" };
  if (unsafeSchemePattern.test(body) || !markdownLinksAreSafe(body)) return { ok: false, code: "unsafe_url" };

  return {
    ok: true,
    article: {
      slug: metadata.slug,
      title: metadata.title,
      category: metadata.category,
      version,
      status: metadata.status as SupportArticleDocument["status"],
      audienceRoles: audienceRoles as SupportRole[],
      requiredFeatures,
      clinicalContent: false,
      bodyMarkdown: body
    }
  };
}
