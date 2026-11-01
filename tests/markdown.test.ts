import { describe, expect, it } from "vitest";
import { isSimple, parseInline, parseMarkdown, toPlainText } from "../src/lib/markdown.ts";

describe("inline formatting", () => {
  it("parses bold, italic, highlight, strike and code", () => {
    expect(parseInline("a **b** _c_ *d* ~~e~~ `f`")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", v: "b" },
      { t: "text", v: " " },
      { t: "italic", v: "c" },
      { t: "text", v: " " },
      { t: "mark", v: "d" },
      { t: "text", v: " " },
      { t: "strike", v: "e" },
      { t: "text", v: " " },
      { t: "code", v: "f" },
    ]);
  });

  it("leaves snake_case and lone symbols alone", () => {
    expect(parseInline("my_var_name costs 5 * 3")).toEqual([{ t: "text", v: "my_var_name costs 5 * 3" }]);
  });

  it("treats HTML and links as plain text", () => {
    expect(parseInline("<b>hi</b> [x](https://e.com)")).toEqual([{ t: "text", v: "<b>hi</b> [x](https://e.com)" }]);
  });
});

describe("blocks", () => {
  it("parses headings, lists, numbers, quotes, code and text", () => {
    const md = "# Rules\nFor tonight:\nno arguing\n- no phones\n* I pick\n1. first\n2. second\n> she said\n```\nraw *text*\n```";
    expect(parseMarkdown(md).map((b) => b.kind)).toEqual(["heading", "text", "bullets", "numbers", "quote", "code"]);
    const [, text, bullets, numbers, , code] = parseMarkdown(md);
    expect(text).toMatchObject({ lines: [[{ v: "For tonight:" }], [{ v: "no arguing" }]] });
    expect(bullets).toMatchObject({ items: [[{ v: "no phones" }], [{ v: "I pick" }]] });
    expect(numbers).toMatchObject({ start: 1, items: [[{ v: "first" }], [{ v: "second" }]] });
    expect(code).toEqual({ kind: "code", text: "raw *text*" });
  });

  it("does not mistake a highlight at the start of a line for a bullet", () => {
    expect(parseMarkdown("*Wife material* huh")[0].kind).toBe("text");
  });

  it("knows which entries are a single simple line", () => {
    expect(isSimple("Who is **Sam Gym**?")).toBe(true);
    expect(isSimple("Line one\nLine two")).toBe(false);
    expect(isSimple("- just a bullet")).toBe(false);
  });
});

describe("plain text for copying", () => {
  it("removes formatting marks but keeps structure", () => {
    expect(toPlainText("# Rules\nWho is **Sam** _really_?\n- no `phones`\n1. *me*\n> ok")).toBe(
      "Rules\nWho is Sam really?\n- no phones\n1. me\n> ok",
    );
  });
});
