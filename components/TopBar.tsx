"use client";

import Image from "next/image";
import Link from "next/link";
import { AccountButton } from "@/components/AccountButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SettingsLink } from "@/components/SettingsLink";

type Page = "dashboard" | "friends" | "settings";

const navItems: { label: string; href: string; page: Page }[] = [
  { label: "Dashboard", href: "/dashboard", page: "dashboard" },
  { label: "Friends",   href: "/friends",   page: "friends"   },
];

export function TopBar({ current }: { current?: Page }) {
  return (
    <div className="flex items-center justify-center h-14 relative">
      {/* Logo — left */}
      <Link href="/" className="absolute left-0 flex items-center" aria-label="Cha(t)os home">
        <Image src="/chatos-t-logo.png" alt="Cha(t)os" width={32} height={32} />
      </Link>

      {/* Nav — center */}
      <nav className="flex items-center gap-5">
        {navItems.map((item, i) => (
          <span key={item.page} className="flex items-center gap-5">
            {i > 0 && (
              <span style={{ color: "rgba(247,245,250,0.1)" }}>·</span>
            )}
            {current === item.page ? (
              <span
                className="text-xs font-medium"
                style={{ color: "rgba(247,245,250,0.75)" }}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-xs transition-colors"
                style={{ color: "rgba(247,245,250,0.3)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(247,245,250,0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(247,245,250,0.3)")}
              >
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Actions — right */}
      <div className="absolute right-0 flex items-center gap-1">
        <SettingsLink />
        <NotificationBell />
        <AccountButton />
      </div>
    </div>
  );
}
