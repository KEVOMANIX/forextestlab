import { describe, expect, it } from "vitest";

import { getLearnArticles, parseArticle } from "./index";
import { parseBlocks, parseFrontmatter, parseInline } from "./markdown";

describe("parseInline", () => {
  it("reads bold, italic, code and links", () => {
    expect(parseInline("a **b** *c* `d` [e](/f)")).toEqual([
      { t: "text", v: "a " }, { t: "strong", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " }, { t: "code", v: "d" }, { t: "text", v: " " },
      { t: "link", href: "/f", c: [{ t: "text", v: "e" }] },
    ]);
  });

  it("drops unsafe link targets but keeps the text", () => {
    expect(parseInline("[x](javascript:alert(1))")[0]).toEqual({ t: "text", v: "x" });
    expect(parseInline("[x](//evil.example)")[0]).toEqual({ t: "text", v: "x" });
  });
});

describe("parseBlocks", () => {
  it("builds headings, lists, callouts, tables and images", () => {
    const blocks = parseBlocks([
      "## Win rate", "", "Line one", "line two.", "", "## Win rate", "",
      "- a", "- b", "", "1. one", "", "> [!WARNING]", "> Careful.", "",
      "| A | B |", "| --- | --- |", "| 1 | 2 |", "", "![Chart](/learn/c.webp \"Caption\")", "![bad](javascript:x)",
    ].join("\n"));
    expect(blocks.map(block => block.t)).toEqual(["h2", "p", "h2", "ul", "ol", "callout", "table", "img"]);
    expect(blocks[0]).toMatchObject({ id: "win-rate" });
    expect(blocks[2]).toMatchObject({ id: "win-rate-2" });
    expect(blocks[1]).toEqual({ t: "p", c: [{ t: "text", v: "Line one line two." }] });
    expect(blocks[5]).toMatchObject({ tone: "warning", c: [[{ t: "text", v: "Careful." }]] });
    expect(blocks[6]).toMatchObject({ rows: [[[{ v: "1" }], [{ v: "2" }]]] });
    expect(blocks[7]).toEqual({ t: "img", src: "/learn/c.webp", alt: "Chart", caption: "Caption" });
  });
});

describe("parseFrontmatter", () => {
  it("reads values, quotes, lists and skips comments", () => {
    const { data, body } = parseFrontmatter("---\r\ntitle: \"A: B\"\r\n# note: x\r\ntakeaways:\r\n  - one\r\n  - two\r\n---\r\nBody");
    expect(data).toEqual({ title: "A: B", takeaways: ["one", "two"] });
    expect(body).toBe("Body");
  });
});

describe("parseArticle", () => {
  it("names the file and the field when the header is wrong", () => {
    expect(() => parseArticle("bad", "---\ntitle: X\ndescription: Y\ncategory: Nope\ndate: 2026-01-01\n---\n")).toThrow(/bad\.md: category/);
    expect(() => parseArticle("bad", "---\ntitle: X\ndescription: Y\ncategory: Risk\ndate: 2026-01-01\ncolour: red\n---\n")).toThrow(/bad\.md/);
  });
});

describe("content/learn", () => {
  it("every article file is valid and has a unique featured slot at most", () => {
    const articles = getLearnArticles();
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.filter(article => article.featured).length).toBeLessThanOrEqual(1);
    for (const article of articles) expect(article.blocks.length, article.slug).toBeGreaterThan(0);
  });
});
