import { Readable } from "node:stream";

import { describe, it, expect } from "vitest";

import { parseCsvString, streamCsv } from "@/lib/market-data/csv-parser";

describe("parseCsvString", () => {
  it("parses simple rows and trims headers", () => {
    const rows = parseCsvString(" a , b , c \n1,2,3\n4,5,6\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.record).toEqual({ a: "1", b: "2", c: "3" });
    expect(rows[0]?.lineNumber).toBe(2);
    expect(rows[1]?.lineNumber).toBe(3);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const rows = parseCsvString(
      'name,note\n"Doe, John","He said ""hi"""\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({
      name: "Doe, John",
      note: 'He said "hi"',
    });
  });

  it("handles quoted fields with embedded newlines", () => {
    const rows = parseCsvString('a,b\n"line1\nline2",x\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({ a: "line1\nline2", b: "x" });
  });

  it("handles CRLF and LF line endings equivalently", () => {
    const lf = parseCsvString("a,b\n1,2\n3,4\n");
    const crlf = parseCsvString("a,b\r\n1,2\r\n3,4\r\n");
    expect(crlf).toEqual(lf);
  });

  it("skips trailing empty lines", () => {
    const rows = parseCsvString("a,b\n1,2\n\n\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({ a: "1", b: "2" });
  });

  it("supports a custom delimiter", () => {
    const rows = parseCsvString("a;b;c\n1;2;3\n", { delimiter: ";" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("parses a file with no trailing newline", () => {
    const rows = parseCsvString("a,b\n1,2");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({ a: "1", b: "2" });
  });
});

describe("streamCsv", () => {
  it("buffers partial lines across chunk boundaries", async () => {
    // The stream is split mid-line: "a,b\n1," + "2\n3,4\n".
    const stream = Readable.from(["a,b\n1,", "2\n3,4\n"]);
    const rows = [];
    for await (const row of streamCsv(stream)) {
      rows.push(row);
    }
    expect(rows).toHaveLength(2);
    expect(rows[0]?.record).toEqual({ a: "1", b: "2" });
    expect(rows[0]?.lineNumber).toBe(2);
    expect(rows[1]?.record).toEqual({ a: "3", b: "4" });
    expect(rows[1]?.lineNumber).toBe(3);
  });

  it("buffers a quoted field split across chunks", async () => {
    const stream = Readable.from(['a,b\n"hello, ', 'world",x\n']);
    const rows = [];
    for await (const row of streamCsv(stream)) {
      rows.push(row);
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({ a: "hello, world", b: "x" });
  });
});
