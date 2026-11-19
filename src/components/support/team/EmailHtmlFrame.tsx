"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows an inbound email's original HTML the way Gmail does: on a white card,
 * sized to its content. Falls back to the plain-text body (children) when the
 * HTML is unavailable. The sandbox omits allow-scripts, so nothing in the
 * email can run; allow-same-origin only lets this component read its height.
 */
export function EmailHtmlFrame({
  messageId,
  children,
}: {
  messageId: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<"loading" | "html" | "text">("loading");
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc || doc.contentType !== "text/html" || !doc.body) {
        setState("text");
        return;
      }
      const measure = () =>
        setHeight(Math.max(60, doc.documentElement.scrollHeight, doc.body.scrollHeight));
      measure();
      setState("html");
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      // Late images change the height after load.
      Array.from(doc.images).forEach((image) => image.addEventListener("load", measure));
    };
    frame.addEventListener("load", onLoad);
    // The frame can finish loading before this effect attaches.
    if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.URL !== "about:blank") {
      onLoad();
    }
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      {state !== "text" && (
        <iframe
          ref={ref}
          title="Email"
          src={`/api/support/messages/${messageId}/html`}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          style={{ height }}
          className={`w-full rounded-lg border-0 bg-white ${state === "loading" ? "invisible absolute" : ""}`}
        />
      )}
      {state !== "html" && children}
    </>
  );
}
