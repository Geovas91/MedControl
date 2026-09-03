import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadSupportArticle, isSupportArticleSlug, searchPublishedSupportArticles } from "../../lib/support/articles.ts";
import { parseSafeSupportMarkdown } from "../../lib/support/markdown.ts";
import { canReadSupportTicket, classifySupportSeverity, isTenantVisibleSupportMessage } from "../../lib/support/tickets.ts";
import type { SupportArticleDocument } from "../../lib/support/content.ts";
import type { SupportContext } from "../../lib/support/types.ts";

const page = readFileSync("app/dashboard/support/page.tsx", "utf8");
const articlePage = readFileSync("app/dashboard/support/articles/[slug]/page.tsx", "utf8");
const ticketPage = readFileSync("app/dashboard/support/tickets/[id]/page.tsx", "utf8");
const actions = readFileSync("app/dashboard/support/actions.ts", "utf8");
const articleService = readFileSync("lib/server/support/articles.ts", "utf8");
const ticketService = readFileSync("lib/server/support/tickets.ts", "utf8");
const navigation = readFileSync("components/dashboard/dashboard-shell.tsx", "utf8");
const migration = readFileSync("supabase/migrations/0034_service_bot_v1_foundations.sql", "utf8");
const nextConfig = readFileSync("next.config.mjs", "utf8");

const context: SupportContext = {
  userId: "10000000-0000-4000-8000-000000000001", clinicId: "20000000-0000-4000-8000-000000000001", role: "doctor",
  planId: "plus", effectiveSubscriptionStatus: "active", entitlements: { service_bot_tier1: true, google_calendar: true, whatsapp_notifications: false }
};

function article(overrides: Partial<SupportArticleDocument> = {}): SupportArticleDocument {
  return { slug: "crear-una-cita", title: "Cómo crear una cita", category: "citas", version: 1, status: "published", audienceRoles: ["owner", "admin", "doctor", "assistant"], requiredFeatures: [], clinicalContent: false, bodyMarkdown: "# Crear cita\n\nAbre Citas para agendar.", ...overrides };
}

test("KB search only returns published content and prioritizes title over summary and document", () => {
  const results = searchPublishedSupportArticles([
    article({ slug: "body", title: "Otra guía", bodyMarkdown: "# Otra\n\nPuedes crear una cita aquí." }),
    article({ slug: "draft", status: "draft", title: "Crear cita borrador" }),
    article({ slug: "title", title: "Crear cita", bodyMarkdown: "# Guía\n\nPasos." })
  ], "crear cita");
  assert.deepEqual(results.map((item) => item.slug), ["title", "body"]);
  assert.equal(results.some((item) => item.status !== "published"), false);
});

test("article eligibility hides drafts, wrong roles and unavailable features", () => {
  assert.equal(canReadSupportArticle(article(), context), true);
  assert.equal(canReadSupportArticle(article({ status: "review" }), context), false);
  assert.equal(canReadSupportArticle(article({ audienceRoles: ["owner"] }), context), false);
  assert.equal(canReadSupportArticle(article({ requiredFeatures: ["whatsapp_notifications"] }), context), false);
  assert.match(articleService, /canReadSupportArticle/);
});

test("article route rejects invalid slugs and renders no raw HTML", () => {
  assert.equal(isSupportArticleSlug("crear-una-cita"), true);
  assert.equal(isSupportArticleSlug("../secreto"), false);
  assert.match(articlePage, /notFound\(\)/);
  assert.doesNotMatch(articlePage, /dangerouslySetInnerHTML/);
  assert.match(nextConfig, /source: "\/dashboard\/support\/:path\*"[\s\S]+Cache-Control", value: "private, no-store, max-age=0"[\s\S]+Referrer-Policy", value: "no-referrer"/);
  assert.deepEqual(parseSafeSupportMarkdown("# Ayuda\n\nUsa **Citas**."), [
    { type: "heading", level: 1, children: [{ type: "text", value: "Ayuda" }] },
    { type: "paragraph", children: [{ type: "text", value: "Usa " }, { type: "strong", value: "Citas" }, { type: "text", value: "." }] }
  ]);
});

test("tenant navigation distinguishes both assistant surfaces", () => {
  assert.match(navigation, /href: "\/dashboard\/bot", label: "Asistente de agenda"/);
  assert.match(navigation, /href: "\/dashboard\/support", label: "Ayuda y soporte"/);
});

test("tenant UI is server-first and contains the required safe states", () => {
  assert.doesNotMatch(page, /^"use client"/);
  assert.match(page, /force-dynamic/);
  assert.match(page, /No encontramos resultados publicados/);
  assert.match(page, /No fue posible cargar tus tickets/);
  assert.match(page, /Asistente guiado/);
  assert.match(actions, /rate_limited/);
  assert.match(ticketService, /result\.error\?\.code === "P0001"\) return rateLimited/);
});

test("diagnostic selection is static and arbitrary diagnostic names are rejected server-side", () => {
  const form = readFileSync("components/support/support-forms.tsx", "utf8");
  const diagnostics = readFileSync("lib/server/support/diagnostics.ts", "utf8");
  assert.match(form, /supportDiagnosticIds\.map/);
  assert.match(diagnostics, /isSupportDiagnosticId\(diagnosticId\)/);
  assert.doesNotMatch(diagnostics, /import\(diagnosticId|from\(diagnosticId/);
});

test("ticket severity remains server-side and the client has no severity field", () => {
  assert.equal(classifySupportSeverity("authentication", "access_blocked"), "high");
  assert.doesNotMatch(readFileSync("components/support/support-forms.tsx", "utf8"), /name="severity"/);
  assert.doesNotMatch(actions, /formData\.get\("severity"\)/);
  assert.match(migration, /v_severity := case/);
});

test("doctor and assistant can read own tickets only while owner and admin can read clinic tickets", () => {
  assert.equal(canReadSupportTicket("doctor", "user-a", "user-a"), true);
  assert.equal(canReadSupportTicket("assistant", "user-a", "user-b"), false);
  assert.equal(canReadSupportTicket("owner", "user-a", "user-b"), true);
  assert.equal(canReadSupportTicket("admin", "user-a", "user-b"), true);
  assert.match(ticketService, /\.eq\("created_by", contextResult\.context\.userId\)/);
  assert.match(ticketService, /role !== "owner" && contextResult\.context\.role !== "admin"/);
});

test("ticket detail uses tenant plus ticket filters and inaccessible tickets become a generic 404", () => {
  assert.match(ticketService, /\.eq\("clinic_id", contextResult\.context\.clinicId\)\.eq\("id", ticketId\)/);
  assert.match(ticketPage, /state === "not_found" \|\| result\.state === "forbidden"\) notFound\(\)/);
  assert.doesNotMatch(ticketPage, /clinic_id|clinicId|assigned_to|assignedTo/);
});

test("internal messages are excluded by RLS, query and pure projection guard", () => {
  assert.equal(isTenantVisibleSupportMessage("requester"), true);
  assert.equal(isTenantVisibleSupportMessage("clinic"), true);
  assert.equal(isTenantVisibleSupportMessage("internal"), false);
  assert.match(ticketService, /\.neq\("visibility", "internal"\)/);
  assert.match(migration, /visibility <> 'internal'/);
});

test("ticket mutations accept no clinic, author kind, internal visibility or severity from forms", () => {
  for (const forbidden of ["clinic_id", "author_kind", "visibility", "severity", "assigned_to"]) assert.doesNotMatch(actions, new RegExp(`formData\\.get\\(\\"${forbidden}\\"\\)`));
  assert.match(actions, /hasValidSupportMutationOrigin/);
  assert.match(ticketService, /p_clinic_id: contextResult\.context\.clinicId/);
});

test("tenant status changes are restricted to requester transitions", () => {
  assert.match(actions, /transitionOwnSupportTicket\(ticketId, fromStatus, "closed"\)/);
  assert.doesNotMatch(actions, /triaged|in_progress|severity|assigned_to|internal note/);
  assert.match(migration, /v_ticket\.status='resolved' and p_to_status in \('open','closed'\)/);
});

test("support audit events remain structured without free text", () => {
  assert.match(migration, /support_diagnostic_executed/);
  assert.match(migration, /support_ticket_created/);
  assert.match(migration, /support_ticket_message_added/);
  const auditWrites = Array.from(migration.matchAll(/insert into public\.audit_logs[\s\S]+?return true;/g), (match) => match[0]).join("\n");
  assert.doesNotMatch(auditWrites, /subject|summary|body|question|patient|diagnosis/i);
});

test("support UI does not use service role, realtime, attachments or corrective operations", () => {
  const sources = [page, articlePage, ticketPage, actions, articleService, ticketService].join("\n");
  assert.doesNotMatch(sources, /createAdminClient|service_role|channel\(|realtime|attachment|resend|openai|anthropic/i);
});
