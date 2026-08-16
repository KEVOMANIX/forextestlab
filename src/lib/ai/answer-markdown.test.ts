import { describe, expect, it } from "vitest";

import { parseAnswer, parseInline } from "./answer-markdown";

describe("AI answer inline grammar", () => {
  it("turns a bracketed trade number into a citation", () => {
    expect(parseInline("Losses cluster in [#12] and [#17].")).toEqual([
      { type: "text", text: "Losses cluster in " },
      { type: "citation", tradeNumber: 12 },
      { type: "text", text: " and " },
      { type: "citation", tradeNumber: 17 },
      { type: "text", text: "." },
    ]);
  });

  it("keeps bold and leaves a bare hash alone", () => {
    expect(parseInline("**Win rate** is 63% on #1 setups")).toEqual([
      { type: "bold", text: "Win rate" },
      { type: "text", text: " is 63% on #1 setups" },
    ]);
  });
});

describe("AI answer block grammar", () => {
  it("reads headings, bullets and numbered lists", () => {
    const blocks = parseAnswer(
      ["## Where it goes wrong", "- Asia session", "- Friday afternoons", "", "1. Cut the size", "2. Skip Fridays"].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "bullets",
      "ordered",
    ]);
    expect(blocks[1]).toMatchObject({ items: [[{ text: "Asia session" }], [{ text: "Friday afternoons" }]] });
    expect(blocks[2]).toMatchObject({ items: [[{ text: "Cut the size" }], [{ text: "Skip Fridays" }]] });
  });

  it("reads a pipe table and drops its alignment row", () => {
    const blocks = parseAnswer(
      ["| Session | Net |", "| --- | ---: |", "| London | +$2,940 |", "| Asia | -$250 |"].join("\n"),
    );
    expect(blocks).toHaveLength(1);
    const table = blocks[0]!;
    expect(table.type).toBe("table");
    if (table.type !== "table") throw new Error("expected a table");
    expect(table.head).toHaveLength(2);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]![0]).toEqual([{ type: "text", text: "Asia" }]);
  });

  it("does not render a lone table row as a table", () => {
    const blocks = parseAnswer("| Session | Net |");
    expect(blocks[0]!.type).toBe("paragraph");
  });

  it("separates adjacent lists instead of merging them", () => {
    const blocks = parseAnswer(["- one", "1. two", "- three"].join("\n"));
    expect(blocks.map((block) => block.type)).toEqual([
      "bullets",
      "ordered",
      "bullets",
    ]);
  });

  it("carries citations through list items", () => {
    const blocks = parseAnswer("- The worst was [#3]");
    expect(blocks[0]).toMatchObject({
      type: "bullets",
      items: [[{ type: "text" }, { type: "citation", tradeNumber: 3 }]],
    });
  });

  it("ignores blank input", () => {
    expect(parseAnswer("")).toEqual([]);
    expect(parseAnswer("\n\n  \n")).toEqual([]);
  });
});
