"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackLink({
  fallback = "/app",
  label = "Back to dashboard",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex items-center gap-2 rounded-lg border app-border px-3 py-2 text-sm font-semibold app-muted transition-colors hover:border-brand-400/40 hover:text-brand-300 ${className}`}
    >
      <ArrowLeft size={16} aria-hidden />
      {label}
    </button>
  );
}
