"use client";
import type { DrawingJSON } from "@/lib/chart/drawing/types";
import { defaultDrawingTemplate, drawingTemplate } from "@/lib/chart/tool-templates";
import { ToolTemplateMenu } from "./ToolTemplateMenu";

export function DrawingTemplateMenu({ value, onChange }: { value: DrawingJSON; onChange: (patch: Partial<DrawingJSON>) => void }) {
  const apply = (saved: ReturnType<typeof drawingTemplate>) => {
    // The engine merges styles; explicitly clear optional fields absent in the preset.
    const cleared = Object.fromEntries(Object.keys(value.style).map(key => [key, undefined]));
    onChange({ style: { ...cleared, ...saved.style }, visibleTimeframes: saved.visibleTimeframes });
  };
  return <ToolTemplateMenu scope={`drawing:${value.kind}`} value={drawingTemplate(value)} onApply={apply} onDefaults={() => apply(defaultDrawingTemplate(value))} />;
}
