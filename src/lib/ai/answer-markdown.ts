/**
 * The small slice of markdown the AI analyst is asked to produce: headings,
 * bullets, numbered lists, simple pipe tables, bold, and bracketed trade
 * citations like [#12].
 *
 * Parsing is kept apart from rendering so the block and inline grammar can be
 * tested directly — a mis-parsed table or a citation that fails to become a
 * link is otherwise only visible by reading a live answer.
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "citation"; tradeNumber: number };

export type AnswerBlock =
  | { type: "heading"; content: InlineToken[] }
  | { type: "paragraph"; content: InlineToken[] }
  | { type: "bullets"; items: InlineToken[][] }
  | { type: "ordered"; items: InlineToken[][] }
  | { type: "table"; head: InlineToken[][]; rows: InlineToken[][][] };

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,6}\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** A markdown alignment row — |---|:--:| — carries no data. */
const TABLE_RULE = /^\s*\|?[\s:|-]+\|?\s*$/;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|\[#\d+\])/g)) {
    if (!part) continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      tokens.push({ type: "bold", text: part.slice(2, -2) });
      continue;
    }
    const citation = /^\[#(\d+)\]$/.exec(part);
    if (citation) {
      tokens.push({ type: "citation", tradeNumber: Number(citation[1]) });
      continue;
    }
    tokens.push({ type: "text", text: part });
  }
  return tokens;
}

function splitRow(row: string): InlineToken[][] {
  return row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];
  let table: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push({ type: "bullets", items: bullets.map(parseInline) });
      bullets = [];
    }
    if (ordered.length) {
      blocks.push({ type: "ordered", items: ordered.map(parseInline) });
      ordered = [];
    }
    if (table.length) {
      const rows = table.filter((row) => !TABLE_RULE.test(row)).map(splitRow);
      table = [];
      // A table needs a header and at least one body row to be worth the
      // markup; anything less reads better as plain lines.
      if (rows.length >= 2) {
        blocks.push({ type: "table", head: rows[0]!, rows: rows.slice(1) });
      } else if (rows.length === 1) {
        blocks.push({
          type: "paragraph",
          content: rows[0]!.flatMap((cell, index) =>
            index === 0 ? cell : [{ type: "text" as const, text: " · " }, ...cell],
          ),
        });
      }
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (TABLE_ROW.test(line)) {
      if (bullets.length || ordered.length) flush();
      table.push(line);
      continue;
    }
    if (BULLET.test(line)) {
      if (ordered.length || table.length) flush();
      bullets.push(line.replace(BULLET, ""));
      continue;
    }
    if (ORDERED.test(line)) {
      if (bullets.length || table.length) flush();
      ordered.push(line.replace(ORDERED, ""));
      continue;
    }
    flush();
    if (HEADING.test(line)) {
      blocks.push({ type: "heading", content: parseInline(line.replace(HEADING, "")) });
    } else if (line.trim()) {
      blocks.push({ type: "paragraph", content: parseInline(line) });
    }
  }
  flush();
  return blocks;
}
