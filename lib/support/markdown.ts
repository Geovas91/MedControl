export type SafeMarkdownInline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "link"; label: string; href: string };

export type SafeMarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; children: SafeMarkdownInline[] }
  | { type: "paragraph"; children: SafeMarkdownInline[] }
  | { type: "list"; items: SafeMarkdownInline[][] };

function parseInline(value: string): SafeMarkdownInline[] {
  const result: SafeMarkdownInline[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/dashboard\/[a-z0-9_?&=\/#.-]+|https:\/\/clinicontrol\.mx\/[a-z0-9_?&=\/#.-]*)\))/gi;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push({ type: "text", value: value.slice(cursor, index) });
    if (match[2]) result.push({ type: "strong", value: match[2] });
    else result.push({ type: "link", label: match[3], href: match[4] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) result.push({ type: "text", value: value.slice(cursor) });
  return result;
}
export function parseSafeSupportMarkdown(markdown: string): SafeMarkdownBlock[] {
  const blocks: SafeMarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) });
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: SafeMarkdownInline[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(parseInline(lines[index].trim().slice(2)));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index].trim()) && !lines[index].trim().startsWith("- ")) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
