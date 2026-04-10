"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";

const COLORS = [
  { hex: "#DFA649", label: "Amber" },
  { hex: "#88739E", label: "Mauve" },
  { hex: "#8CBDB9", label: "Sage" },
  { hex: "#97D181", label: "Green" },
  { hex: "#849440", label: "Olive" },
  { hex: "#DBD5E2", label: "Lavender" },
];

export function RoomSettings({
  roomId,
  room,
  currentUserId,
  currentColor,
  isOwner,
  isClaudiuOwner,
}: {
  roomId: Id<"rooms">;
  room: Doc<"rooms">;
  currentUserId: string;
  currentColor?: string;
  isOwner: boolean;
  isClaudiuOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const updateColor = useMutation(api.rooms.updateParticipantColor);
  const updateChainLimit = useMutation(api.rooms.updateRoomChainLimit);
  const updateClaudiuLurk = useMutation(api.rooms.updateClaudiuLurk);

  // Local chain limit state for debounced saves
  const [localChainLimit, setLocalChainLimit] = useState(room.chainLimit ?? 5);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from server when room changes
  useEffect(() => {
    setLocalChainLimit(room.chainLimit ?? 5);
  }, [room.chainLimit]);

  const handleChainLimitChange = useCallback(
    (value: number) => {
      setLocalChainLimit(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateChainLimit({ roomId, chainLimit: value });
      }, 300);
    },
    [roomId, updateChainLimit]
  );

  // Outside-click dismiss
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleColorPick = (hex: string) => {
    localStorage.setItem("chatos:preferredColor", hex);
    updateColor({ roomId, userId: currentUserId, color: hex });
  };

  const showOwnerSections = isOwner || isClaudiuOwner;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
        style={{
          background: open ? "rgba(139,189,185,0.15)" : "rgba(139,189,185,0.08)",
          border: "1px solid rgba(139,189,185,0.15)",
          color: "var(--sage-teal)",
        }}
        title="Room settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-[calc(100vw-2rem)] sm:w-72 max-w-[300px] rounded-xl overflow-hidden z-[60]"
          style={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Room settings
            </p>
          </div>

          <div className="px-4 py-3 flex flex-col gap-4">
            {/* Color Picker */}
            <div>
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Your color
              </label>
              <div className="flex items-center gap-2 mt-2">
                {COLORS.map((c) => {
                  const isActive = currentColor === c.hex;
                  return (
                    <button
                      key={c.hex}
                      onClick={() => handleColorPick(c.hex)}
                      title={c.label}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                      style={{
                        background: c.hex,
                        boxShadow: isActive ? `0 0 0 2px var(--bg), 0 0 0 4px ${c.hex}` : "none",
                        opacity: isActive ? 1 : 0.7,
                      }}
                    >
                      {isActive && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="var(--deep-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Owner sections */}
            {showOwnerSections && (
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }} className="flex flex-col gap-4">
                {/* Chain Limit */}
                {isOwner && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                        Chain depth
                      </label>
                      <span className="text-xs font-mono" style={{ color: "var(--fg)" }}>
                        {localChainLimit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={localChainLimit}
                      onChange={(e) => handleChainLimitChange(Number(e.target.value))}
                      className="w-full mt-1.5"
                      style={{ accentColor: "var(--amber)" }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
                      Max Claude-to-Claude mention chain depth
                    </p>
                  </div>
                )}

                {/* Claudiu Lurk Toggle */}
                {isClaudiuOwner && (
                  <div>
                    <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Claudiu
                    </label>
                    <div className="flex gap-1 mt-1.5">
                      {(["active", "lurking"] as const).map((mode) => {
                        const isLurking = room.claudiuLurk ?? false;
                        const isSelected = mode === "active" ? !isLurking : isLurking;
                        return (
                          <button
                            key={mode}
                            onClick={() => updateClaudiuLurk({ roomId, lurk: mode === "lurking" })}
                            className="px-3 py-1.5 rounded-lg text-xs capitalize transition-all"
                            style={{
                              background: isSelected ? "rgba(223,166,73,0.12)" : "transparent",
                              border: isSelected ? "1px solid var(--amber)" : "1px solid var(--border)",
                              color: isSelected ? "var(--amber)" : "var(--text-muted)",
                            }}
                          >
                            {mode === "active" ? "Active" : "Lurking"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
                      {room.claudiuLurk ? "Claudiu ignores mentions in this room" : "Claudiu responds when mentioned"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
