/**
 * A small Markdown reader for Learn articles. It understands only the subset the
 * guides use and returns plain data, which the page renders as React elements,
 * so an article file can never inject HTML or scripts.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong" | "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type CalloutTone = "note" | "tip" | "warning";

export type Block =
  | { t: "h2"; id: string; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "callout"; tone: CalloutTone; c: Inline[][] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "img"; src: string; alt: string; caption: string };

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Links may point inside the site, to a heading, or to an https page. */
export function safeHref(href: string) {
  return /^(\/(?!\/)|#|https:\/\/|mailto:)/.test(href) ? href : null;
}

/** Images must be served by this site or over https. */
function safeSrc(src: string) {
  return /^(\/(?!\/)|https:\/\/)/.test(src) ? src : null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "strong", c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "em", c: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: "code", v: m[3] });
    else {
      const href = safeHref(m[5] ?? "");
      out.push(href ? { t: "link", href, c: parseInline(m[4] ?? "") } : { t: "text", v: m[4] ?? "" });
    }
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ t: "text", v: source.slice(last) });
  return out;
}

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => parseInline(cell.trim()));

/** Splits an article body into blocks. Blank lines separate paragraphs. */
export function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const at = (n: number) => (lines[n] ?? "").trim();
  const blocks: Block[] = [];
  const ids = new Set<string>();
  let i = 0;

  while (i < lines.length) {
    const trimmed = at(i);
    if (!trimmed) { i++; continue; }

    if (trimmed.startsWith("## ")) {
      const text = trimmed.slice(3).trim();
      let id = slugify(text);
      for (let n = 2; ids.has(id); n++) id = `${slugify(text)}-${n}`;
      ids.add(id);
      blocks.push({ t: "h2", id, text });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ t: "h3", text: trimmed.slice(4).trim() });
      i++;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (image) {
      const src = safeSrc(image[2] ?? "");
      if (src) blocks.push({ t: "img", alt: image[1] ?? "", src, caption: image[3] ?? "" });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && at(i).startsWith(">")) quoted.push(at(i++).replace(/^>\s?/, ""));
      const marker = quoted[0]?.match(/^\[!(NOTE|TIP|WARNING)\]\s*$/i);
      const tone = (marker?.[1]?.toLowerCase() ?? "note") as CalloutTone;
      const text = (marker ? quoted.slice(1) : quoted).join("\n");
      const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\n/g, " ").trim()).filter(Boolean);
      blocks.push({ t: "callout", tone, c: paragraphs.map(parseInline) });
      continue;
    }

    if (trimmed.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && at(i).startsWith("|")) rows.push(at(i++));
      const [head = "", divider, ...rest] = rows;
      const body = divider && /^[\s|:-]+$/.test(divider) ? rest : rows.slice(1);
      blocks.push({ t: "table", head: cells(head), rows: body.map(cells) });
      continue;
    }

    const bullet = /^[-*]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      const pattern = bullet.test(trimmed) ? bullet : numbered;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(at(i))) items.push(parseInline(at(i++).replace(pattern, "")));
      blocks.push({ t: pattern === bullet ? "ul" : "ol", items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && at(i) && !/^(#{2,3} |>|\||[-*]\s|\d+[.)]\s|!\[)/.test(at(i))) {
      paragraph.push(at(i++));
    }
    if (paragraph.length === 0) paragraph.push(at(i++));
    blocks.push({ t: "p", c: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}

/**
 * Reads the `---` header at the top of an article: `key: value` lines, plus
 * lists written as an indented `- item` under a `key:` line.
 */
export function parseFrontmatter(source: string): { data: Record<string, string | string[]>; body: string } {
  const text = source.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const raw of (match[1] ?? "").split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1] ?? ""));
      continue;
    }
    const pair = raw.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    const [, key = "", value = ""] = pair ?? [];
    if (!key) continue;
    if (value === "") {
      listKey = key;
      data[key] = [];
    } else {
      listKey = null;
      data[key] = unquote(value);
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function unquote(value: string) {
  const v = value.trim();
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

/** Visible words in the body, for the read-time estimate. */
export function countWords(body: string) {
  return body.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/[#>*`|[\]()_-]/g, " ").split(/\s+/).filter(Boolean).length;
}
