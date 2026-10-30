"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

/** A thin bar under the navbar that fills as the reader moves through the article. */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const root = document.documentElement;
      const room = root.scrollHeight - root.clientHeight;
      setProgress(room > 0 ? Math.min(1, root.scrollTop / room) : 0);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => { removeEventListener("scroll", update); removeEventListener("resize", update); };
  }, []);
  return <div aria-hidden className="fixed inset-x-0 top-16 z-40 h-0.5 origin-left bg-brand-400" style={{ transform: `scaleX(${progress})` }} />;
}

/** "On this page" links that highlight the section being read. */
export function TableOfContents({ headings }: { headings: { id: string; text: string }[] }) {
  const [active, setActive] = useState(headings[0]?.id);
  useEffect(() => {
    const update = () => {
      let current = headings[0]?.id;
      for (const { id } of headings) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top < 140) current = id;
      }
      setActive(current);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, [headings]);

  if (headings.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">On this page</p>
      <ul>
        {headings.map(({ id, text }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`block border-l-2 py-1.5 pl-3 leading-snug transition ${active === id ? "border-brand-400 font-semibold text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Copy-link plus X and LinkedIn share links for an article. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const button = "grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-sm font-bold text-slate-400 transition hover:border-white/25 hover:text-white";
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        className={button}
        aria-label={copied ? "Link copied" : "Copy link"}
        title={copied ? "Link copied" : "Copy link"}
        onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined)}
      >
        {copied ? <Check size={15} className="text-brand-300" /> : <Link2 size={15} />}
      </button>
      <a className={button} aria-label="Share on X" title="Share on X" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}>X</a>
      <a className={button} aria-label="Share on LinkedIn" title="Share on LinkedIn" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>in</a>
    </div>
  );
}
