import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export function screenPageCuts(height: number, pageHeight: number, blocks: { top: number; bottom: number }[]): number[] {
  const cuts = [0];
  while (cuts.at(-1)! < height) {
    const start = cuts.at(-1)!;
    let end = Math.min(height, start + pageHeight);
    if (end < height) {
      // Keep cards and table rows whole when they can fit on a page.
      const crossing = blocks.filter(block => block.top < end && block.bottom > end && block.bottom - block.top <= pageHeight);
      if (crossing.length) {
        const candidate = Math.min(...crossing.map(block => block.top));
        if (candidate > start + pageHeight * .2) end = candidate;
      }
    }
    cuts.push(end);
  }
  return cuts;
}

/** A captured part of the page, placed at `top` in the report's single flow. */
interface Strip { canvas: HTMLCanvasElement; label: string; top: number; left: number; height: number }

const PART_GAP = 16;

/**
 * Captures every `[data-pdf-part]` inside `element` and lays them out as one
 * continuous report, breaking pages only where a card would otherwise be cut.
 * `onProgress` hears the share done, 0 to 100.
 */
export async function exportAnalyticsScreen(element: HTMLElement, name: string, onProgress?: (percent: number) => void) {
  await document.fonts.ready;
  // Let the page finish drawing the parts it shows only while exporting.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))));
  onProgress?.(5);
  const parts = [...element.querySelectorAll<HTMLElement>("[data-pdf-part]")];
  if (!parts.length) throw new Error("Analytics is not visible.");
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const tallest = Math.max(...parts.map((part) => part.scrollHeight));
  if (width <= 0 || tallest <= 0) throw new Error("Analytics is not visible.");
  const scale = Math.min(2, 16000 / Math.max(width, tallest));
  const background = getComputedStyle(element).getPropertyValue("--app-bg").trim() || "#10211b";

  const doc = new jsPDF({ orientation: width >= 850 ? "landscape" : "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18, imageWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - 18;
  const cssPageHeight = availableHeight / imageWidth * width;

  const strips: Strip[] = [];
  const blocks: { top: number; bottom: number }[] = [];
  let flowHeight = 0;
  for (const [i, part] of parts.entries()) {
    const rect = part.getBoundingClientRect();
    const height = Math.ceil(part.scrollHeight);
    const top = flowHeight + (i ? PART_GAP : 0);
    strips.push({ canvas: await capture(part, Math.ceil(rect.width), height, scale, background), label: part.dataset.pdfPart || "Analytics", top, left: rect.left - bounds.left, height });
    for (const node of part.querySelectorAll("section, article, header, tr")) {
      const box = node.getBoundingClientRect();
      const block = { top: Math.max(top, top + box.top - rect.top - 6), bottom: top + box.bottom - rect.top + 6 };
      if (block.bottom > block.top && block.bottom - block.top <= cssPageHeight) blocks.push(block);
    }
    flowHeight = top + height;
    onProgress?.(5 + Math.round((i + 1) / parts.length * 85));
  }

  const cuts = screenPageCuts(flowHeight, cssPageHeight, blocks);
  const pages = cuts.length - 1;
  for (let i = 0; i < pages; i++) {
    if (i) doc.addPage();
    const start = cuts[i]!, end = cuts[i + 1]!;
    const slice = document.createElement("canvas");
    slice.width = Math.round(width * scale); slice.height = Math.max(1, Math.round((end - start) * scale));
    const context = slice.getContext("2d"); if (!context) throw new Error("Canvas unavailable.");
    context.fillStyle = background; context.fillRect(0, 0, slice.width, slice.height);
    for (const strip of strips) {
      const from = Math.max(start, strip.top), to = Math.min(end, strip.top + strip.height);
      if (to <= from) continue;
      const sourceY = Math.round((from - strip.top) * scale), rows = Math.round((to - from) * scale);
      context.drawImage(strip.canvas, 0, sourceY, strip.canvas.width, rows, Math.round(strip.left * scale), Math.round((from - start) * scale), strip.canvas.width, rows);
    }
    doc.setFillColor(background); doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, imageWidth, slice.height / slice.width * imageWidth);
    const label = [...strips].reverse().find((strip) => strip.top <= start + 1)?.label ?? strips[0]!.label;
    doc.setFontSize(8); doc.setTextColor("#a8b7b1");
    doc.text(`ForexTestLab | ${label} | ${i + 1} / ${pages}`, margin, pageHeight - 12);
    slice.width = 0; slice.height = 0;
  }
  for (const strip of strips) { strip.canvas.width = 0; strip.canvas.height = 0; }
  onProgress?.(95);
  const filename = `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) || "session"}-analytics.pdf`;
  await doc.save(filename, { returnPromise: true });
  onProgress?.(100);
}

function capture(part: HTMLElement, width: number, height: number, scale: number, background: string) {
  return html2canvas(part, {
    scale, width, height, backgroundColor: background, useCORS: true, logging: false,
    onclone: (_doc, cloned) => {
      // html2canvas's text baseline can extend below a tightly clipped line.
      // Give truncated labels paint room without changing the surrounding layout.
      for (const label of cloned.querySelectorAll<HTMLElement>(".truncate")) {
        const style = _doc.defaultView!.getComputedStyle(label);
        label.style.paddingBottom = `${(parseFloat(style.paddingBottom) || 0) + 6}px`;
        label.style.marginBottom = `${(parseFloat(style.marginBottom) || 0) - 6}px`;
      }
      // The live replay's analytics sits inside a scrolling fixed modal.
      // Expand its cloned ancestors so below-the-fold cards are not clipped.
      let parent = cloned.parentElement;
      while (parent && parent !== _doc.body) {
        parent.style.overflow = "visible"; parent.style.height = "auto";
        parent.style.maxHeight = "none"; parent.style.position = "static";
        parent = parent.parentElement;
      }
    },
  });
}
