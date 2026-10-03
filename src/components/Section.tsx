import type { ReactNode } from "react";

interface SectionProps {
  id?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  centered?: boolean;
}

/** Consistent vertical rhythm + heading treatment for landing sections. */
export function Section({
  id,
  title,
  description,
  children,
  className = "",
  centered = false,
}: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-24 py-20 sm:py-24 ${className}`}>
      <div className="container-page">
        {(title || description) && (
          <div className={`max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
            {title && (
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-4 text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
                {description}
              </p>
            )}
          </div>
        )}
        <div className={title || description ? "mt-12" : ""}>
          {children}
        </div>
      </div>
    </section>
  );
}
