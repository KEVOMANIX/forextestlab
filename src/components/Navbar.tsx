"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, UserPlus, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { mainNav } from "@/lib/site";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b border-white/10 bg-surface-950/85 backdrop-blur"
          : "border-b border-transparent"
      }`}
    >
      <nav
        className="container-page flex h-16 items-center justify-between"
        aria-label="Primary"
      >
        <Logo className="h-8 sm:h-9" priority />

        <div className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/sign-in"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link href="/app" className="btn-secondary py-2.5">
            Launch app
            <ArrowUpRight size={15} aria-hidden />
          </Link>
          <Link href="/sign-up" className="btn-primary py-2.5 shadow-glow">
            <UserPlus size={16} aria-hidden />
            Create free account
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-200 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="border-t border-white/10 bg-surface-950/95 backdrop-blur lg:hidden"
      >
        <div className="container-page flex flex-col gap-1 py-4">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/app"
            onClick={() => setOpen(false)}
            className="btn-secondary mt-2 w-full"
          >
            Launch app
            <ArrowUpRight size={16} aria-hidden />
          </Link>
          <Link
            href="/sign-up"
            onClick={() => setOpen(false)}
            className="btn-primary mt-2 w-full"
          >
            <UserPlus size={16} aria-hidden />
            Create free account
          </Link>
          <Link
            href="/sign-in"
            onClick={() => setOpen(false)}
            className="rounded-lg px-3 py-3 text-center text-sm font-semibold text-slate-300"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}
