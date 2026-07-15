/**
 * Streaming CSV parser.
 *
 * Parses CSV without loading the whole file into memory: the stream is read in
 * utf8 chunks, partial lines are buffered across chunk boundaries, and each
 * completed data row is yielded as a record keyed by the (trimmed) header row.
 *
 * Handles quoted fields with embedded delimiters/newlines, "" quote escaping,
 * CRLF and LF line endings, trailing empty lines, and a configurable delimiter.
 */

import type { Readable } from "node:stream";

export interface RawCsvRow {
  /** 1-based line number counting the header as line 1 (first data row = 2). */
  lineNumber: number;
  record: Record<string, string>;
}

export interface CsvParserOptions {
  /** Field delimiter. Defaults to ",". */
  delimiter?: string;
}

const DEFAULT_DELIMITER = ",";

/**
 * Incremental CSV tokenizer. Feed it text chunks; it emits complete logical
 * rows (arrays of field strings) as they finish. A row is only complete once we
 * are outside any quoted field and hit a line terminator.
 */
class CsvTokenizer {
  private readonly delimiter: string;
  private field = "";
  private row: string[] = [];
  private inQuotes = false;
  /** True when the previous char was a closing quote of a quoted field. */
  private afterCloseQuote = false;
  private started = false;

  constructor(delimiter: string) {
    this.delimiter = delimiter;
  }

  /** Consume a chunk of text, returning any rows that completed within it. */
  push(chunk: string): string[][] {
    const rows: string[][] = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const char = chunk[i];
      if (char === undefined) continue;

      if (this.inQuotes) {
        if (char === '"') {
          // Peek for an escaped quote ("").
          if (chunk[i + 1] === '"') {
            this.field += '"';
            i += 1;
          } else {
            this.inQuotes = false;
            this.afterCloseQuote = true;
          }
        } else {
          this.field += char;
        }
        continue;
      }

      if (char === '"' && this.field === "" && !this.afterCloseQuote) {
        this.inQuotes = true;
        this.started = true;
        continue;
      }

      if (char === this.delimiter) {
        this.row.push(this.field);
        this.field = "";
        this.afterCloseQuote = false;
        this.started = true;
        continue;
      }

      if (char === "\n" || char === "\r") {
        if (char === "\r" && chunk[i + 1] === "\n") {
          i += 1;
        }
        rows.push(this.finishRow());
        continue;
      }

      this.field += char;
      this.afterCloseQuote = false;
      this.started = true;
    }
    return rows;
  }

  /** Flush any buffered final row (a file without a trailing newline). */
  flush(): string[][] {
    if (this.inQuotes || this.started || this.field !== "" || this.row.length > 0) {
      const hadContent =
        this.started || this.field !== "" || this.row.length > 0;
      if (!hadContent) return [];
      return [this.finishRow()];
    }
    return [];
  }

  private finishRow(): string[] {
    this.row.push(this.field);
    const completed = this.row;
    this.field = "";
    this.row = [];
    this.inQuotes = false;
    this.afterCloseQuote = false;
    this.started = false;
    return completed;
  }
}

/** True when a tokenized row is empty (blank line: single empty field). */
function isEmptyRow(fields: string[]): boolean {
  return fields.length === 0 || (fields.length === 1 && fields[0] === "");
}

/** Build a record from header names and a data row's fields. */
function toRecord(headers: string[], fields: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let i = 0; i < headers.length; i += 1) {
    const key = headers[i];
    if (key === undefined || key === "") continue;
    record[key] = fields[i] ?? "";
  }
  return record;
}

/**
 * Stream a CSV, using the first non-empty row as headers and yielding one
 * record per (non-empty) data row. lineNumber counts the header as line 1.
 */
export async function* streamCsv(
  input: Readable,
  options?: CsvParserOptions,
): AsyncGenerator<RawCsvRow> {
  const delimiter = options?.delimiter ?? DEFAULT_DELIMITER;
  const tokenizer = new CsvTokenizer(delimiter);
  let headers: string[] | undefined;
  let lineNumber = 0;

  const emit = function* (fields: string[]): Generator<RawCsvRow> {
    if (headers === undefined) {
      if (isEmptyRow(fields)) return;
      headers = fields.map((h) => h.trim());
      lineNumber = 1;
      return;
    }
    lineNumber += 1;
    if (isEmptyRow(fields)) return;
    yield { lineNumber, record: toRecord(headers, fields) };
  };

  input.setEncoding("utf8");
  for await (const chunk of input) {
    const text = typeof chunk === "string" ? chunk : String(chunk);
    for (const fields of tokenizer.push(text)) {
      yield* emit(fields);
    }
  }
  for (const fields of tokenizer.flush()) {
    yield* emit(fields);
  }
}

/** Parse a CSV string into rows. Synchronous helper (primarily for tests). */
export function parseCsvString(
  text: string,
  options?: CsvParserOptions,
): RawCsvRow[] {
  const delimiter = options?.delimiter ?? DEFAULT_DELIMITER;
  const tokenizer = new CsvTokenizer(delimiter);
  const allRows = [...tokenizer.push(text), ...tokenizer.flush()];

  const result: RawCsvRow[] = [];
  let headers: string[] | undefined;
  let lineNumber = 0;

  for (const fields of allRows) {
    if (headers === undefined) {
      if (isEmptyRow(fields)) continue;
      headers = fields.map((h) => h.trim());
      lineNumber = 1;
      continue;
    }
    lineNumber += 1;
    if (isEmptyRow(fields)) continue;
    result.push({ lineNumber, record: toRecord(headers, fields) });
  }

  return result;
}
