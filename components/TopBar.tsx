"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
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

  return (
    <div className="flex items-center h-14 gap-4 sm:gap-6">
      {/* Logo — left */}
      <Link href="/" className="flex-shrink-0 flex items-center" aria-label="Cha(t)os home">
        <Image src="/chatos-t-logo.png" alt="Cha(t)os" width={32} height={32} />
      </Link>

      {/* Nav — center, takes remaining space */}
      <nav className="flex items-center gap-3 sm:gap-5 min-w-0 flex-1 justify-center">
        {allNavItems.map((item, i) => (
          <span key={item.page} className="flex items-center gap-3 sm:gap-5">
            {i > 0 && (
              <span style={{ color: "var(--border)" }}>·</span>
            )}
            {activePage === item.page ? (
              <span className="text-xs font-medium nav-link-active whitespace-nowrap">
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="text-xs nav-link whitespace-nowrap">
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Actions — right */}
      <div className="flex-shrink-0 flex items-center gap-1">
        <ChangelogBadge />
        <SettingsLink />
        <NotificationBell />
        <AccountButton />
      </div>
    </div>
  );
}
