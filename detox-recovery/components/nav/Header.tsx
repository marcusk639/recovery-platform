"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const NAV_LINKS = [
  { href: "/services", label: "Services" },
  { href: "/consulting", label: "For Clinicians" },
  { href: "/resources", label: "Resources" },
] as const;

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold text-slate-900 hover:text-teal-700"
          onClick={close}
        >
          Withdrawal Support
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-teal-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button
            href="/services#fit-check"
            variant="primary"
            className="hidden sm:inline-block"
          >
            Request a fit check
          </Button>
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          id="mobile-nav"
          className="border-t border-slate-200 bg-white px-4 pb-6 pt-4 md:hidden"
        >
          <nav
            aria-label="Mobile"
            className="flex flex-col gap-4 text-sm font-medium text-slate-700"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-teal-700"
                onClick={close}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2">
              <Button
                href="/services#fit-check"
                variant="primary"
                className="block w-full text-center"
                onClick={close}
              >
                Request a fit check
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
