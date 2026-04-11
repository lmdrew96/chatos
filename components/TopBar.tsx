"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useState, useRef, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { AccountButton } from "@/components/AccountButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ChangelogBadge } from "@/components/ChangelogBadge";
import { SettingsLink } from "@/components/SettingsLink";

type Page = "dashboard" | "friends" | "settings" | "admin";

const navItems: { label: string; href: string; page: Page }[] = [
  { label: "Dashboard", href: "/dashboard", page: "dashboard" },
  { label: "Friends",   href: "/friends",   page: "friends"   },
];

export function TopBar({ current }: { current?: Page }) {
  const pathname = usePathname();
  const isAdmin = useQuery(api.claudiuConfig.isAdmin);
  const derivedCurrent: Page | undefined = pathname.startsWith("/friends")
    ? "friends"
    : pathname.startsWith("/dashboard")
      ? "dashboard"
      : pathname.startsWith("/settings")
        ? "settings"
        : pathname.startsWith("/admin")
          ? "admin"
          : undefined;
  const activePage = current ?? derivedCurrent;

  const allNavItems = isAdmin
    ? [...navItems, { label: "Admin", href: "/admin/claudiu", page: "admin" as Page }]
    : navItems;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="flex items-center h-14 gap-4 sm:gap-6">
      {/* Logo — left */}
      <Link href="/" className="flex-shrink-0 flex items-center" aria-label="Cha(t)os home">
        <Image src="/chatos-t-logo.png" alt="Cha(t)os" width={32} height={32} />
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions — right */}
      <div className="flex-shrink-0 flex items-center gap-1">
        <ChangelogBadge />
        <SettingsLink />
        <NotificationBell />

        {/* Nav menu dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{
              color: menuOpen ? "var(--amber)" : "var(--text-muted)",
              background: menuOpen ? "rgba(223,166,73,0.08)" : "transparent",
            }}
            onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.color = "var(--fg)"; }}
            onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.color = "var(--text-muted)"; }}
            aria-label="Navigation menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="2" y1="12" x2="14" y2="12" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-10 w-44 rounded-xl overflow-hidden z-50 py-1"
              style={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
              }}
            >
              {allNavItems.map((item) => (
                <Link
                  key={item.page}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm transition-colors"
                  style={{
                    color: activePage === item.page ? "var(--amber)" : "var(--fg)",
                    background: activePage === item.page ? "rgba(223,166,73,0.08)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (activePage !== item.page) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (activePage !== item.page) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <AccountButton />
      </div>
    </div>
  );
}
