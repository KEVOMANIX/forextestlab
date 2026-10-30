import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Block, CalloutTone, Inline } from "@/lib/learn/markdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.t) {
      case "text": return node.v;
      case "strong": return <strong key={index} className="font-semibold text-white">{renderInline(node.c)}</strong>;
      case "em": return <em key={index}>{renderInline(node.c)}</em>;
      case "code": return <code key={index} className="rounded bg-white/[.07] px-1.5 py-0.5 font-mono text-[0.85em] text-brand-200">{node.v}</code>;
      case "link": return node.href.startsWith("https://")
        ? <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-4 hover:text-brand-200">{renderInline(node.c)}</a>
        : <Link key={index} href={node.href} className="font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-4 hover:text-brand-200">{renderInline(node.c)}</Link>;
    }
  });
}

const CALLOUTS: Record<CalloutTone, { label: string; icon: typeof Info; box: string; text: string }> = {
  note: { label: "Note", icon: Info, box: "border-sky-300/50 bg-sky-300/[.06]", text: "text-sky-200" },
  tip: { label: "Tip", icon: Lightbulb, box: "border-brand-400/60 bg-brand-400/[.06]", text: "text-brand-300" },
  warning: { label: "Watch out", icon: AlertTriangle, box: "border-amber-300/60 bg-amber-300/[.06]", text: "text-amber-200" },
};

/** Renders a parsed article body with the Learn typography. */
export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="text-[17px] leading-8 text-slate-200 sm:text-lg sm:leading-[1.8]">
      {blocks.map((block, index) => {
        switch (block.t) {
          case "h2": return <h2 key={index} id={block.id} className="mb-3 mt-12 scroll-mt-28 text-2xl font-semibold leading-tight tracking-tight text-white first:mt-0 sm:text-[28px]">{block.text}</h2>;
          case "h3": return <h3 key={index} className="mb-2 mt-8 text-xl font-semibold text-white">{block.text}</h3>;
          case "p": return <p key={index} className="mb-6">{renderInline(block.c)}</p>;
          case "ul": return <ul key={index} className="mb-6 list-disc space-y-2 pl-6 marker:text-brand-400">{block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ul>;
          case "ol": return <ol key={index} className="mb-6 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-brand-300">{block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</ol>;
          case "callout": {
            const style = CALLOUTS[block.tone];
            const Icon = style.icon;
            return (
              <aside key={index} className={`mb-7 rounded-r-xl border-l-[3px] px-5 py-4 text-base leading-7 ${style.box}`}>
                <p className={`mb-1 flex items-center gap-2 text-sm font-semibold ${style.text}`}><Icon size={15} aria-hidden />{style.label}</p>
                {block.c.map((paragraph, i) => <p key={i} className="mt-1">{renderInline(paragraph)}</p>)}
              </aside>
            );
          }
          case "table": return (
            <div key={index} className="mb-7 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px] leading-6">
                <thead><tr>{block.head.map((cell, i) => <th key={i} className="border-b border-white/15 px-3 py-2.5 text-sm font-semibold text-slate-400">{renderInline(cell)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, i) => <td key={i} className="border-b border-white/10 px-3 py-2.5 tabular-nums">{renderInline(cell)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
          case "img": return (
            <figure key={index} className="mb-8 mt-2">
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-white/10 bg-surface-900">
                <Image src={block.src} alt={block.alt} fill sizes="(min-width: 768px) 700px, 100vw" className="object-cover" />
              </div>
              {block.caption && <figcaption className="mt-2 text-sm text-slate-400">{block.caption}</figcaption>}
            </figure>
          );
        }
      })}
    </div>
  );
}
