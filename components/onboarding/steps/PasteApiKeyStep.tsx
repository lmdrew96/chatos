"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { Check, AlertCircle } from "lucide-react";

export function PasteApiKeyStep({
  onKeySaved,
}: {
  onKeySaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveApiKey = useMutation(api.apiKeys.saveApiKey);

  const isValidFormat = key.trim().startsWith("sk-ant-") && key.trim().length >= 20;

  const handleSave = async () => {
    if (!isValidFormat) return;
    setStatus("saving");
    try {
      await saveApiKey({ encryptedKey: key.trim() });
      setStatus("saved");
      onKeySaved();
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-5 py-2">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Paste your Anthropic API key below. It&apos;ll be stored securely on our servers so your Claude
        can work across rooms.
      </p>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="sk-ant-..."
            autoComplete="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all font-mono field-focus"
            style={{
              background: "var(--surface)",
              border: `1px solid ${
                status === "saved"
                  ? "var(--soft-green)"
                  : status === "error"
                    ? "rgba(255,100,100,0.4)"
                    : "var(--border)"
              }`,
              color: "var(--fg)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          {status === "saved" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Check size={16} style={{ color: "var(--soft-green)" }} />
            </div>
          )}
          {status === "error" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AlertCircle size={16} style={{ color: "rgba(255,100,100,0.7)" }} />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={!isValidFormat || status === "saving" || status === "saved"}
          className="w-full py-2.5 rounded-lg font-bold text-sm transition-all"
          style={{
            background:
              status === "saved"
                ? "rgba(151,209,129,0.15)"
                : isValidFormat
                  ? "var(--amber)"
                  : "var(--surface)",
            color:
              status === "saved"
                ? "var(--soft-green)"
                : isValidFormat
                  ? "var(--deep-dark)"
                  : "var(--text-muted)",
            fontFamily: "var(--font-super-bakery)",
            opacity: !isValidFormat || status === "saving" ? 0.5 : 1,
            cursor: !isValidFormat || status === "saving" || status === "saved" ? "not-allowed" : "pointer",
          }}
        >
          {status === "saving"
            ? "Saving..."
            : status === "saved"
              ? "Saved!"
              : "Save key"}
        </button>
      </div>

      {/* Claudiu feedback */}
      <div className="flex items-start gap-3">
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
          {status === "saved" ? (
            <>Boom! You&apos;re in. That key is stored securely &mdash; I&apos;ll never show it in plain text again.</>
          ) : status === "error" ? (
            <>Hmm, something went wrong saving that. Try again?</>
          ) : key && !isValidFormat ? (
            <>Hmm, that doesn&apos;t look right. Make sure you copied the whole thing &mdash; they&apos;re long! Check that it starts with <code className="font-mono" style={{ color: "var(--mauve)" }}>sk-ant-</code>.</>
          ) : (
            <>Paste your key above. It should start with <code className="font-mono" style={{ color: "var(--mauve)" }}>sk-ant-</code> and be pretty long.</>
          )}
        </div>
      </div>
    </div>
  );
}
