/**
 * The small slice of markdown the AI analyst is asked to produce: headings,
 * bullets, numbered lists, simple pipe tables, bold, and bracketed trade
 * citations like [#12] or [#12@abc123] (trade 12 of the session whose ref is
 * abc123), and ```chart blocks holding a small bar chart as JSON.
 *
 * Parsing is kept apart from rendering so the block and inline grammar can be
 * tested directly — a mis-parsed table or a citation that fails to become a
 * link is otherwise only visible by reading a live answer.
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "citation"; tradeNumber: number; sessionRef?: string };

export interface AnswerChart {
  title: string;
  /** Shown with each value: "$", "%", "R", "trades". */
  unit: string;
  data: { label: string; value: number }[];
}

export type AnswerBlock =
  | { type: "heading"; content: InlineToken[] }
  | { type: "paragraph"; content: InlineToken[] }
  | { type: "bullets"; items: InlineToken[][] }
  | { type: "ordered"; items: InlineToken[][] }
  | { type: "table"; head: InlineToken[][]; rows: InlineToken[][][] }
  /** null while the chart is still streaming in, or when its JSON is unusable. */
  | { type: "chart"; chart: AnswerChart | null };

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const HEADING = /^#{1,6}\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
/** A markdown alignment row — |---|:--:| — carries no data. */
const TABLE_RULE = /^\s*\|?[\s:|-]+\|?\s*$/;
const FENCE = /^\s*```\s*(\w*)\s*$/;
const CITATION = /^\[#(\d+)(?:@([a-z0-9]{4,12}))?\]$/;
const MAX_CHART_BARS = 24;

/** Accepts only the chart shape the AI is asked for; anything else is dropped rather than drawn wrong. */
export function parseChart(json: string): AnswerChart | null {
  try {
    const value = JSON.parse(json) as { title?: unknown; unit?: unknown; data?: unknown };
    if (!Array.isArray(value.data)) return null;
    const data = value.data
      .filter((row): row is { label?: unknown; value: number } => Boolean(row) && typeof row.value === "number" && Number.isFinite(row.value))
      .map((row) => ({ label: String(row.label ?? "").slice(0, 40), value: row.value }))
      .slice(0, MAX_CHART_BARS);
    if (!data.length) return null;
    return {
      title: typeof value.title === "string" ? value.title.slice(0, 80) : "",
      unit: typeof value.unit === "string" ? value.unit.slice(0, 8) : "",
      data,
    };
  } catch {
    return null;
  }
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*|\[#\d+(?:@[a-z0-9]{4,12})?\])/g)) {
    if (!part) continue;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      tokens.push({ type: "bold", text: part.slice(2, -2) });
      continue;
    }
    const citation = CITATION.exec(part);
    if (citation) {
      tokens.push(citation[2]
        ? { type: "citation", tradeNumber: Number(citation[1]), sessionRef: citation[2] }
        : { type: "citation", tradeNumber: Number(citation[1]) });
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
  /** Lines of an open code fence, and whether it is a chart. */
  let fence: { chart: boolean; lines: string[] } | null = null;

  const closeFence = (open: { chart: boolean; lines: string[] }, finished: boolean) => {
    if (open.chart) {
      // An unclosed chart is still streaming in.
      blocks.push({ type: "chart", chart: finished ? parseChart(open.lines.join("\n")) : null });
      return;
    }
    for (const code of open.lines) {
      if (code.trim()) blocks.push({ type: "paragraph", content: parseInline(code) });
    }
  };

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
    const fenceLine = FENCE.exec(line);
    if (fence) {
      if (fenceLine) {
        closeFence(fence, true);
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    if (fenceLine) {
      flush();
      fence = { chart: fenceLine[1] === "chart", lines: [] };
      continue;
    }
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
  if (fence) closeFence(fence, false);
  return blocks;
}
