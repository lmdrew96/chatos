"use client";

import { useQuery, useMutation } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useRef, useEffect } from "react";

export function ChangelogBadge() {
  const { isAuthenticated } = useConvexAuth();
  const unseenCount = useQuery(api.changelog.getUnseenCount);
  const entries = useQuery(api.changelog.getEntries, { limit: 15 });
  const markSeen = useMutation(api.changelog.markSeen);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => {
      if (!o && (unseenCount ?? 0) > 0) {
        markSeen({});
      }
      return !o;
    });
  };

  if (!isAuthenticated) return null;

  const count = unseenCount ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg transition-colors"
        style={{
          color: open ? "var(--purple)" : "var(--text-muted)",
          background: open ? "rgba(167,139,250,0.08)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = "var(--fg)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }}
        aria-label="Changelog"
      >
        {/* Git commit / changelog icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="1" x2="8" y2="5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="8" y1="11" x2="8" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
            style={{ background: "var(--purple)", color: "#fff" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-[calc(100vw-2rem)] sm:w-96 max-w-[384px] rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Changelog
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Recent commits
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {entries && entries.length > 0 ? (
              entries.map((entry) => {
                const date = new Date(entry.committedAt);
                const relative = formatRelativeDate(date);
                return (
                  <div
                    key={entry._id}
                    className="px-4 py-3 flex flex-col gap-1"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <p className="text-sm leading-snug" style={{ color: "var(--fg)" }}>
                      {formatCommitMessage(entry.message)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--purple)" }}
                      >
                        {entry.sha.slice(0, 7)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {entry.author}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {relative}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p
                className="px-4 py-6 text-sm text-center"
                style={{ color: "var(--text-dim)" }}
              >
                No changelog entries yet
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Capitalize first letter and strip common prefixes for display. */
function formatCommitMessage(msg: string): string {
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
