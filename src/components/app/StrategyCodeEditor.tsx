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
const helpFor = (key: string): { signature: string; description: string } | undefined => (functionHelp as Record<string, { signature: string; description: string }>)[key];

const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/^(?:strategy\.(?:entry|exit|long|short)|ta\.(?:ema|sma|rsi|crossover|crossunder)|input\.(?:int|float))\b/)) return "variableName.function";
    if (stream.match(/^(?:strategy|if|close)\b/)) return "keyword";
    if (stream.match(/^\d+(?:\.\d+)?\b/)) return "number";
    if (stream.match(/^[A-Za-z_][A-Za-z_0-9]*/)) return "variableName";
    stream.next();
    return null;
  },
});
const codeColors = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--app-code-keyword)" },
  { tag: tags.function(tags.variableName), color: "var(--app-code-function)" },
  { tag: tags.string, color: "var(--app-code-string)" },
  { tag: tags.number, color: "var(--app-code-number)" },
  { tag: tags.comment, color: "var(--app-code-comment)" },
  { tag: tags.variableName, color: "var(--app-text)" },
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

function diagnosticsFor(source: string, server: StrategyDiagnostic[]): Diagnostic[] {
  const parsed = parseStrategy(source);
  const issues = [...(parsed.ok ? [] : parsed.diagnostics), ...server];
  const lines = source.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  return issues.map(issue => {
    const lineIndex = Math.max(0, Math.min(lines.length - 1, issue.line - 1));
    const line = lines[lineIndex]!;
    const from = starts[lineIndex]! + (line.search(/\S/) < 0 ? 0 : line.search(/\S/));
    return { from, to: Math.max(from, starts[lineIndex]! + line.length), severity: "error" as const, message: issue.message, source: "FTL Script" };
  });
}

export function StrategyCodeEditor({ value, onChange, serverDiagnostics }: { value: string; onChange: (value: string) => void; serverDiagnostics: StrategyDiagnostic[] }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const serverRef = useRef(serverDiagnostics);
  const [hint, setHint] = useState<{ signature: string; description: string } | null>(null);
  changeRef.current = onChange;
  serverRef.current = serverDiagnostics;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          language,
          syntaxHighlighting(codeColors),
          autocompletion({ override: [context => {
            const word = context.matchBefore(/[A-Za-z_][A-Za-z_0-9.]*/);
            if (!word || (word.from === word.to && !context.explicit)) return null;
            const prior = context.state.doc.sliceString(0, context.pos);
            const variables = [...prior.matchAll(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/gm)].map(match => match[1]!).filter(name => !["strategy", "close"].includes(name));
            return { from: word.from, options: [...completions, ...new Set(variables)].map(option => typeof option === "string" ? { label: option, type: "variable" } : option), validFor: /^[A-Za-z_0-9.]*$/ };
          }] }),
          lintGutter(),
          linter(current => diagnosticsFor(current.state.doc.toString(), serverRef.current), { delay: 300 }),
          hoverTooltip((current, position) => {
            const word = current.state.wordAt(position);
            if (!word) return null;
            const before = current.state.doc.sliceString(Math.max(0, word.from - 20), word.to);
            const key = before.match(/(?:strategy\.|ta\.|input\.)?[A-Za-z_]+$/)?.[0] ?? "";
            const help = helpFor(key);
            if (!help) return null;
            return { pos: word.from, end: word.to, create: () => { const dom = document.createElement("div"); dom.className = "p-2 text-xs"; const strong = document.createElement("strong"); strong.textContent = help.signature; const detail = document.createElement("div"); detail.textContent = help.description; dom.append(strong, detail); return { dom }; } };
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged) changeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head;
              const before = update.state.doc.lineAt(cursor).text.slice(0, cursor - update.state.doc.lineAt(cursor).from);
              const key = before.match(/(strategy(?:\.entry|\.exit)?|ta\.(?:ema|sma|rsi|crossover|crossunder)|input\.(?:int|float))\([^()]*$/)?.[1];
              setHint(key ? helpFor(key) ?? null : null);
            }
          }),
          EditorView.theme({
            "&": { height: "420px", backgroundColor: "var(--app-panel-2)", color: "var(--app-text)", fontSize: "13px" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", lineHeight: "1.65" },
            ".cm-gutters": { backgroundColor: "var(--app-panel-2)", color: "var(--app-muted)", borderRight: "1px solid var(--app-border)" },
            ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--app-hover)" },
            ".cm-content": { caretColor: "var(--app-accent-text)" },
            ".cm-selectionBackground": { backgroundColor: "var(--app-accent-wash) !important" },
            ".cm-tooltip": { backgroundColor: "var(--app-panel-solid)", color: "var(--app-text)", border: "1px solid var(--app-border)" },
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
  useEffect(() => { if (viewRef.current) forceLinting(viewRef.current); }, [serverDiagnostics]);

  return <div>
    <div ref={host} aria-label="Strategy script editor" />
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-t app-border px-3 py-2 text-[11px] app-muted" aria-live="polite">
      <span>{hint ? <><strong className="font-mono text-[var(--app-code-function)]">{hint.signature}</strong> · {hint.description}</> : "Ctrl+Space suggestions · Ctrl+F find · Ctrl+H replace · F8 next error"}</span>
      <span>FTL Script</span>
    </div>
  </div>;
}
