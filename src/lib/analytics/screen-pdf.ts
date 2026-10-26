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

export async function exportAnalyticsScreen(element: HTMLElement, name: string, tab: string) {
  await document.fonts.ready;
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width), height = Math.ceil(element.scrollHeight);
  if (width <= 0 || height <= 0) throw new Error("Analytics is not visible.");
  const scale = Math.min(2, 16000 / Math.max(width, height));
  const background = getComputedStyle(element).getPropertyValue("--app-bg").trim() || "#10211b";
  const canvas = await html2canvas(element, {
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
  const doc = new jsPDF({ orientation: width >= 850 ? "landscape" : "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth(), pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18, imageWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - 18;
  const cssPageHeight = availableHeight / imageWidth * width;
  const blocks = [...element.querySelectorAll("section, article, header, tr")].map(node => {
    const rect = node.getBoundingClientRect();
    return { top: Math.max(0, rect.top - bounds.top - 6), bottom: rect.bottom - bounds.top + 6 };
  }).filter(block => block.bottom > block.top && block.bottom - block.top <= cssPageHeight);
  const cuts = screenPageCuts(height, cssPageHeight, blocks);
  for (let i = 0; i < cuts.length - 1; i++) {
    if (i) doc.addPage();
    const start = Math.round(cuts[i]! * canvas.height / height);
    const end = Math.round(cuts[i + 1]! * canvas.height / height);
    const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = Math.max(1, end - start);
    const context = slice.getContext("2d"); if (!context) throw new Error("Canvas unavailable.");
    context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    doc.setFillColor(background); doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, imageWidth, slice.height / canvas.width * imageWidth);
    doc.setFontSize(8); doc.setTextColor("#a8b7b1");
    doc.text(`ForexTestLab | ${tab} | ${i + 1} / ${cuts.length - 1}`, margin, pageHeight - 12);
    slice.width = 0; slice.height = 0;
  }
  canvas.width = 0; canvas.height = 0;
  const filename = `${name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) || "session"}-${tab}-analytics.pdf`;
  await doc.save(filename, { returnPromise: true });
}
