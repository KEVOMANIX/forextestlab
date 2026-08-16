"use client";

import { MessageCircle, X } from "lucide-react";

/**
 * The floating support launcher's visual treatment, kept apart from the
 * widget's polling and panel logic so the motion lives in one place.
 *
 * The design is "liquid pulse": the fill is a tall vertical gradient drifting
 * upwards so colour appears to well through the pill, and two staggered rings
 * leave its edge like sonar. Two rules hold it together:
 *
 *  - the button's own layout box never moves, because animating it drags the
 *    hit target out from under a cursor or thumb mid-tap — only the fill,
 *    the rings and the icon move;
 *  - the motion escalates once a reply is actually waiting, so "we are here"
 *    and "you have something to read" are visibly different states.
 */
export function LauncherButton({
  open,
  unread,
  onClick,
}: {
  open: boolean;
  unread: number;
  onClick: () => void;
}) {
  const idle = !open;
  const loud = unread > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="support-panel"
      aria-label={open ? "Close support chat" : "Open support chat"}
      className={`group relative isolate inline-flex items-center gap-2 rounded-full border border-brand-200/30 bg-[linear-gradient(180deg,#0b7a63_0%,#22c3a0_35%,#4fd8ba_50%,#22c3a0_65%,#0b7a63_100%)] bg-[length:100%_280%] px-4 py-3 text-xs font-bold text-surface-950 shadow-glow transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95 motion-reduce:animate-none motion-reduce:transition-none ${
        idle ? "animate-wave-drift" : ""
      }`}
    >
      {idle && (
        <>
          <span
            aria-hidden
            className={`absolute inset-0 -z-10 animate-sonar rounded-full border motion-reduce:animate-none ${
              loud
                ? "border-bear/80 bg-bear/20 [animation-duration:1.6s]"
                : "border-brand-200/70 bg-brand-300/20"
            }`}
          />
          <span
            aria-hidden
            style={{ animationDelay: "2s" }}
            className={`absolute inset-0 -z-10 animate-sonar rounded-full border motion-reduce:animate-none ${
              loud
                ? "border-bear/60 [animation-duration:1.6s]"
                : "border-brand-200/40"
            }`}
          />
        </>
      )}

      <span
        className={`relative z-10 grid h-[17px] w-[17px] place-items-center motion-reduce:animate-none ${
          idle ? (loud ? "animate-nudge" : "animate-launcher-float") : ""
        }`}
      >
        <MessageCircle
          size={17}
          aria-hidden
          className={`absolute transition-all duration-200 ${
            open
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <X
          size={17}
          aria-hidden
          className={`absolute transition-all duration-200 ${
            open
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </span>

      <span className="relative z-10">{open ? "Close" : "Help"}</span>

      {idle && loud && (
        <span className="absolute -right-1 -top-1 z-10 grid h-4 min-w-4 animate-badge-pop place-items-center rounded-full bg-bear px-1 text-[10px] font-bold text-white ring-2 ring-surface-950/40 motion-reduce:animate-none">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
