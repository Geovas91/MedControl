import Link from "next/link";
import { parseSafeSupportMarkdown, type SafeMarkdownInline } from "@/lib/support/markdown";

function Inline({ parts }: { parts: SafeMarkdownInline[] }) {
  return parts.map((part, index) => {
    if (part.type === "strong") return <strong key={index}>{part.value}</strong>;
    if (part.type === "link") return <Link key={index} href={part.href} className="font-semibold text-clinic hover:underline">{part.label}</Link>;
    return <span key={index}>{part.value}</span>;
  });
}
export function SafeSupportMarkdown({ markdown }: { markdown: string }) {
  return <div className="space-y-4 text-sm leading-7 text-[var(--foreground-soft)]">{parseSafeSupportMarkdown(markdown).map((block, index) => {
    if (block.type === "heading") {
      if (block.level === 1) return <h2 key={index} className="text-2xl font-bold text-ink"><Inline parts={block.children} /></h2>;
      return <h3 key={index} className="text-lg font-bold text-ink"><Inline parts={block.children} /></h3>;
    }
    if (block.type === "list") return <ul key={index} className="list-disc space-y-2 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline parts={item} /></li>)}</ul>;
    return <p key={index}><Inline parts={block.children} /></p>;
  })}</div>;
}
