"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { Plus, LogIn, Check } from "lucide-react";

export function CreateJoinRoomStep({
  onRoomReady,
}: {
  onRoomReady: (roomCode: string) => void;
}) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [roomTitle, setRoomTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const createRoom = useMutation(api.rooms.createRoom);
  const getRoomByCode = useQuery(
    api.rooms.getRoomByCode,
    mode === "join" && joinCode.trim() ? { roomCode: joinCode.trim() } : "skip"
  );

  const handleCreate = async () => {
    setStatus("loading");
    try {
      const result = await createRoom({ title: roomTitle.trim() || undefined });
      setStatus("done");
      onRoomReady(result.roomCode);
    } catch {
      setStatus("error");
      setErrorMsg("Failed to create room. Try again?");
    }
  };

  const handleJoin = () => {
    if (getRoomByCode) {
      setStatus("done");
      onRoomReady(joinCode.trim());
    } else {
      setStatus("error");
      setErrorMsg("Room not found. Check the code and try again.");
    }
  };

  if (mode === "choose") {
    return (
      <div className="flex flex-col gap-5 py-2">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Each room is a shared chat space. Everyone brings their own Claude, and you can @mention
          specific models or other users.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => setMode("create")}
            className="flex items-center gap-3 w-full px-5 py-4 rounded-xl text-left transition-all"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(223,166,73,0.15)" }}
            >
              <Plus size={18} style={{ color: "var(--amber)" }} />
            </div>
            <div>
              <h3 className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Create a room
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Start a new room and invite friends
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("join")}
            className="flex items-center gap-3 w-full px-5 py-4 rounded-xl text-left transition-all"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(140,189,185,0.15)" }}
            >
              <LogIn size={18} style={{ color: "var(--sage-teal)" }} />
            </div>
            <div>
              <h3 className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Join with a code
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Paste an invite code from a friend
              </p>
            </div>
          </button>
        </div>

        {/* Claudiu tip */}
        <div className="flex items-start gap-3 mt-2">
          <Image
            src="/claudiu/claudiu-idle.png"
            alt="Claudiu"
            width={32}
            height={32}
            style={{ imageRendering: "pixelated" }}
            className="shrink-0 mt-0.5"
          />
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(136,115,158,0.1)",
              border: "1px solid rgba(136,115,158,0.15)",
              color: "var(--fg)",
            }}
          >
            Quick cheat sheet: @mention a person to ping them. @mention a Claude model to talk to it
            directly. @everyone if you want to cause maximum chaos. My kind of feature.
          </div>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(151,209,129,0.15)" }}
        >
          <Check size={24} style={{ color: "var(--soft-green)" }} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--soft-green)" }}>
          Room ready!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <button
        onClick={() => {
          setMode("choose");
          setStatus("idle");
          setErrorMsg("");
        }}
        className="text-xs self-start px-2 py-1 rounded"
        style={{ color: "var(--text-muted)" }}
      >
        &larr; Back to options
      </button>

      {mode === "create" && (
        <>
          <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
            Room name (optional)
          </label>
          <input
            type="text"
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
            placeholder="e.g. Project brainstorm"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all field-focus"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <button
            onClick={handleCreate}
            disabled={status === "loading"}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
            style={{
              background: "var(--amber)",
              color: "var(--deep-dark)",
              fontFamily: "var(--font-super-bakery)",
              opacity: status === "loading" ? 0.5 : 1,
            }}
          >
            {status === "loading" ? "Creating..." : "Create room"}
          </button>
        </>
      )}

      {mode === "join" && (
        <>
          <label className="text-sm font-medium" style={{ color: "var(--fg)" }}>
            Room code
          </label>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value);
              setStatus("idle");
              setErrorMsg("");
            }}
            placeholder="e.g. chaos-42"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJoin();
            }}
          />
          <button
            onClick={handleJoin}
            disabled={!joinCode.trim()}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
            style={{
              background: joinCode.trim() ? "var(--amber)" : "var(--surface)",
              color: joinCode.trim() ? "var(--deep-dark)" : "var(--text-muted)",
              fontFamily: "var(--font-super-bakery)",
              opacity: !joinCode.trim() ? 0.5 : 1,
            }}
          >
            Join room
          </button>
        </>
      )}

      {status === "error" && errorMsg && (
        <p className="text-xs" style={{ color: "rgba(255,100,100,0.7)" }}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
