import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/lib/site";

import logoFull from "../../public/logo-full.png";

/**
 * ForexTestLab brand lockup. Uses the official transparent-background logo
 * (public/logo-full.png). Height is controlled with the `className` prop
 * (e.g. `h-8`); width scales automatically to preserve the aspect ratio.
 */
export function Logo({
  className = "h-8",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Link
      href="/"
      className="inline-flex items-center"
      aria-label={`${siteConfig.name} home`}
    >
      <Image
        src={logoFull}
        alt={`${siteConfig.name} logo`}
        priority={priority}
        className={`w-auto ${className}`}
        sizes="(max-width: 640px) 150px, 200px"
      />
    </Link>
  );
}
