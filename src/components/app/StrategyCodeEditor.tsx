"use client";

import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, hoverTooltip, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion, snippetCompletion, type Completion } from "@codemirror/autocomplete";
import { linter, lintGutter, forceLinting, type Diagnostic } from "@codemirror/lint";
import { parseStrategy, type StrategyDiagnostic } from "@/lib/strategy-language/parser";

const functionHelp = {
  strategy: { signature: 'strategy("Name", timeframe="1h", risk_percent=1)', description: "Define the strategy name, candle size, and risk per trade." },
  "strategy.entry": { signature: 'strategy.entry("Long", strategy.long)', description: "Open a long or short trade at the next candle open when the if condition is true." },
  "strategy.exit": { signature: 'strategy.exit("Exit", stop_pips=20, take_profit_pips=40)', description: "Set the global stop and target for every trade." },
  "ta.ema": { signature: "ta.ema(close, 9)", description: "Exponential moving average of closing prices." },
  "ta.sma": { signature: "ta.sma(close, 21)", description: "Simple moving average of closing prices." },
  "ta.rsi": { signature: "ta.rsi(close, 14)", description: "Relative strength index of closing prices." },
  "ta.crossover": { signature: "ta.crossover(fast, slow)", description: "True when the first value crosses above the second on this closed candle." },
  "ta.crossunder": { signature: "ta.crossunder(fast, slow)", description: "True when the first value crosses below the second on this closed candle." },
  "input.int": { signature: 'input.int(14, title="Length")', description: "Declare an integer parameter for reuse in the script." },
  "input.float": { signature: 'input.float(0.5, title="Risk")', description: "Declare a decimal parameter for reuse in the script." },
} satisfies Record<string, { signature: string; description: string }>;
const pineFunctionHelp: Record<string, { signature: string; description: string }> = {
  indicator: { signature: 'indicator("Name", overlay=true)', description: "Declare a Pine indicator that can output plot series." },
  strategy: { signature: 'strategy("Name", overlay=true)', description: "Declare a Pine strategy. Order settings can be set in the script." },
  "strategy.entry": { signature: 'strategy.entry("Long", strategy.long)', description: "Submit a simulated entry order." },
  "strategy.exit": { signature: 'strategy.exit("Exit", from_entry="Long", stop=price, limit=price)', description: "Submit stop and limit exit orders." },
  "strategy.close": { signature: 'strategy.close("Long")', description: "Close the named entry." },
  "ta.ema": functionHelp["ta.ema"], "ta.sma": functionHelp["ta.sma"], "ta.rsi": functionHelp["ta.rsi"],
  "ta.crossover": functionHelp["ta.crossover"], "ta.crossunder": functionHelp["ta.crossunder"],
  "input.int": functionHelp["input.int"], "input.float": functionHelp["input.float"],
};
const helpFor = (key: string, mode: "ftl" | "pine"): { signature: string; description: string } | undefined => mode === "pine" ? pineFunctionHelp[key] : (functionHelp as Record<string, { signature: string; description: string }>)[key];

const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^(?:strategy|ta|math|input|request|array|matrix|map|str|timeframe)\.[A-Za-z_][A-Za-z_0-9]*\b/)) return "variableName.function";
    if (stream.match(/^(?:strategy|indicator|library|if|else|for|while|switch|var|varip|import|export|type|method|true|false|na)\b/)) return "keyword";
    if (stream.match(/^\d+(?:\.\d+)?\b/)) return "number";
    if (stream.match(/^[A-Za-z_][A-Za-z_0-9]*/)) return "variableName";
    stream.next();
    return null;
  },
});
const codeColors = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--code-keyword, #8ee3c7)" },
  { tag: tags.function(tags.variableName), color: "var(--code-function, #f3d18e)" },
  { tag: tags.string, color: "var(--code-string, #a8c9ff)" },
  { tag: tags.number, color: "var(--code-number, #f5b7aa)" },
  { tag: tags.comment, color: "var(--code-comment, #9cb8ac)" },
  { tag: tags.variableName, color: "var(--code-text, #e8edea)" },
]);

const completions: Completion[] = [
  snippetCompletion('strategy("${1:Name}", timeframe="${2:1h}", risk_percent=${3:1})', { label: "strategy", type: "function", detail: "declare strategy", info: functionHelp.strategy.description }),
  snippetCompletion('strategy.entry("${1:Long}", strategy.${2:long})', { label: "strategy.entry", type: "function", detail: "place order", info: functionHelp["strategy.entry"].description }),
  snippetCompletion('strategy.exit("${1:Exit}", stop_pips=${2:20}, take_profit_pips=${3:40})', { label: "strategy.exit", type: "function", detail: "stop and target", info: functionHelp["strategy.exit"].description }),
  ...(["ta.ema", "ta.sma", "ta.rsi"] as const).map(label => snippetCompletion(`${label}(close, \${1:14})`, { label, type: "function", detail: functionHelp[label].signature, info: functionHelp[label].description })),
  ...(["ta.crossover", "ta.crossunder"] as const).map(label => snippetCompletion(`${label}(\${1:fast}, \${2:slow})`, { label, type: "function", detail: functionHelp[label].signature, info: functionHelp[label].description })),
  snippetCompletion('input.int(${1:14}, title="${2:Length}")', { label: "input.int", type: "function", detail: "parameter", info: functionHelp["input.int"].description }),
  snippetCompletion('input.float(${1:0.5}, title="${2:Value}")', { label: "input.float", type: "function", detail: "parameter", info: functionHelp["input.float"].description }),
  { label: "close", type: "variable", info: "Closing price of the current candle." },
  { label: "if", type: "keyword", info: "Enter a trade only when the condition below is true." },
  { label: "strategy.long", type: "constant", info: "Long trade direction." },
  { label: "strategy.short", type: "constant", info: "Short trade direction." },
];
const pineCompletions: Completion[] = [
  snippetCompletion('indicator("${1:Name}", overlay=${2:true})', { label: "indicator", type: "function", detail: "Pine indicator declaration" }),
  snippetCompletion('strategy("${1:Name}", overlay=true)', { label: "strategy", type: "function", detail: "Pine strategy declaration" }),
  snippetCompletion('strategy.entry("${1:Long}", strategy.long)', { label: "strategy.entry", type: "function", detail: "Place an entry order" }),
  snippetCompletion('strategy.exit("${1:Exit}", from_entry="${2:Long}", stop=${3:stopPrice}, limit=${4:targetPrice})', { label: "strategy.exit", type: "function", detail: "Stop and limit exit" }),
  snippetCompletion('strategy.close("${1:Long}")', { label: "strategy.close", type: "function", detail: "Close an entry" }),
  ...(["ta.ema", "ta.sma", "ta.rsi"] as const).map(label => snippetCompletion(`${label}(close, \${1:14})`, { label, type: "function" })),
  ...(["ta.crossover", "ta.crossunder"] as const).map(label => snippetCompletion(`${label}(\${1:fast}, \${2:slow})`, { label, type: "function" })),
  snippetCompletion('plot(${1:series}, "${2:Title}")', { label: "plot", type: "function" }),
  snippetCompletion('input.int(${1:14}, title="${2:Length}")', { label: "input.int", type: "function" }),
  { label: "request.security", type: "function", detail: "Other symbol/timeframe data; feed availability varies" },
  ...["open", "high", "low", "close", "volume", "strategy.long", "strategy.short", "if", "else"].map(label => ({ label, type: "variable" })),
];

function diagnosticsFor(source: string, server: StrategyDiagnostic[], mode: "ftl" | "pine"): Diagnostic[] {
  const parsed = mode === "ftl" ? parseStrategy(source) : null;
  const issues = [...(parsed && !parsed.ok ? parsed.diagnostics : []), ...server];
  const lines = source.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  return issues.map(issue => {
    const lineIndex = Math.max(0, Math.min(lines.length - 1, issue.line - 1));
    const line = lines[lineIndex]!;
    const from = starts[lineIndex]! + (line.search(/\S/) < 0 ? 0 : line.search(/\S/));
    return { from, to: Math.max(from, starts[lineIndex]! + line.length), severity: "error" as const, message: issue.message, source: mode === "pine" ? "Pine v6" : "FTL Script" };
  });
}

export function StrategyCodeEditor({ value, onChange, serverDiagnostics, mode = "ftl", minimap = true, wrap = false }: { value: string; onChange: (value: string) => void; serverDiagnostics: StrategyDiagnostic[]; mode?: "ftl" | "pine"; minimap?: boolean; /** Wrap long lines instead of scrolling sideways (narrow panels). */ wrap?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const serverRef = useRef(serverDiagnostics);
  const modeRef = useRef(mode);
  const [hint, setHint] = useState<{ signature: string; description: string } | null>(null);
  changeRef.current = onChange;
  serverRef.current = serverDiagnostics;
  modeRef.current = mode;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          ...(wrap ? [EditorView.lineWrapping] : []),
          keymap.of([indentWithTab]),
          language,
          syntaxHighlighting(codeColors),
          autocompletion({ override: [context => {
            const word = context.matchBefore(/[A-Za-z_][A-Za-z_0-9.]*/);
            if (!word || (word.from === word.to && !context.explicit)) return null;
            const prior = context.state.doc.sliceString(0, context.pos);
            const variables = [...prior.matchAll(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/gm)].map(match => match[1]!).filter(name => !["strategy", "close"].includes(name));
            return { from: word.from, options: [...(modeRef.current === "pine" ? pineCompletions : completions), ...new Set(variables)].map(option => typeof option === "string" ? { label: option, type: "variable" } : option), validFor: /^[A-Za-z_0-9.]*$/ };
          }] }),
          lintGutter(),
          linter(current => diagnosticsFor(current.state.doc.toString(), serverRef.current, modeRef.current), { delay: 300 }),
          hoverTooltip((current, position) => {
            const word = current.state.wordAt(position);
            if (!word) return null;
            const before = current.state.doc.sliceString(Math.max(0, word.from - 20), word.to);
            const key = before.match(/(?:strategy\.|ta\.|input\.)?[A-Za-z_]+$/)?.[0] ?? "";
            const help = helpFor(key, modeRef.current);
            if (!help) return null;
            return { pos: word.from, end: word.to, create: () => { const dom = document.createElement("div"); dom.className = "p-2 text-xs"; const strong = document.createElement("strong"); strong.textContent = help.signature; const detail = document.createElement("div"); detail.textContent = help.description; dom.append(strong, detail); return { dom }; } };
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) changeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head;
              const before = update.state.doc.lineAt(cursor).text.slice(0, cursor - update.state.doc.lineAt(cursor).from);
              const key = before.match(/(strategy(?:\.entry|\.exit|\.close)?|ta\.(?:ema|sma|rsi|crossover|crossunder)|input\.(?:int|float))\([^()]*$/)?.[1];
              setHint(key ? helpFor(key, modeRef.current) ?? null : null);
            }
          }),
          EditorView.theme({
            "&": { height: "100%", minHeight: "390px", backgroundColor: "var(--code-bg, #0b100e)", color: "var(--code-text, #e8edea)", fontSize: "13px" },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", lineHeight: "1.65" },
            ".cm-gutters": { backgroundColor: "var(--code-bg, #0b100e)", color: "var(--code-gutter, #83968c)", borderRight: "1px solid var(--code-border, #27372f)" },
            ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--code-active, #15221b)" },
            ".cm-content": { caretColor: "var(--code-caret, #7be8c4)" },
            // CodeMirror draws its own cursor; without this it is black on the dark editor.
            ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-caret, #7be8c4)", borderLeftWidth: "2px" },
            "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--code-selection, #315348)", color: "inherit" },
            ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--code-selection, #315348) !important" },
            ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--code-selection, #315348) 60%, transparent)" },
            ".cm-panels": { backgroundColor: "var(--code-bar, #111a14)", color: "var(--code-text, #e8edea)" },
            ".cm-panels input, .cm-panels button": { color: "var(--code-text, #e8edea)" },
            ".cm-tooltip": { backgroundColor: "var(--code-tooltip, #18261e)", color: "var(--code-text, #e8edea)", border: "1px solid var(--code-tooltip-border, #385046)" },
            ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--code-selection, #315348)", color: "var(--code-text, #e8edea)" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // The editor is mounted once; subsequent prop changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => { if (viewRef.current) forceLinting(viewRef.current); }, [serverDiagnostics, mode]);

  return <div className="flex h-full min-h-0 flex-col bg-[var(--code-bg)] text-[var(--code-text)]">
    <div className="flex min-h-0 flex-1">
      <div ref={host} aria-label="Strategy script editor" className="min-w-0 flex-1" />
      {minimap && <button type="button" aria-label="Jump through script" className="hidden w-[92px] shrink-0 flex-col items-start justify-start overflow-hidden border-l border-[var(--code-border)] bg-[var(--code-minimap)] px-2 py-3 text-left lg:flex" onClick={event => {
        const view = viewRef.current;
        if (!view) return;
        const ratio = (event.clientY - event.currentTarget.getBoundingClientRect().top) / event.currentTarget.clientHeight;
        const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, Math.ceil(ratio * view.state.doc.lines))));
        view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
        view.focus();
      }}><span className="sr-only">Script minimap</span>{value.split("\n").map((line, index) => <span key={index} aria-hidden className="mb-[2px] block h-[3px] rounded-sm opacity-80" style={{ width: `${Math.max(8, Math.min(100, line.length * 1.4))}%`, backgroundColor: line.trim().startsWith("//") ? "#617c69" : line.includes("strategy.") ? "#e1bd83" : line.includes("ta.") ? "#82c4a7" : "#7a94aa" }} />)}</button>}
    </div>
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-t border-[var(--code-border)] px-3 py-2 text-[11px] text-[var(--code-muted)]" aria-live="polite">
      <span>{hint ? <><strong className="font-mono text-[var(--code-function)]">{hint.signature}</strong> · {hint.description}</> : "Ctrl+Space suggestions · Ctrl+F find · Ctrl+H replace · F8 next error"}</span>
      <span>{mode === "pine" ? "Pine Script v6" : "FTL Script"}</span>
    </div>
  </div>;
}
